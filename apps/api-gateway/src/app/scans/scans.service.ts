import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ZodError } from 'zod';
import type { Scan } from '@prisma/client';
import { NotFoundError, ValidationError } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';
import { QueueName, type ScanJobPayload } from '@autoscanner/queues';
import { ScannerRegistry } from '@autoscanner/scanner-sdk';
import { OBJECT_STORAGE, type ObjectStorage } from '@autoscanner/storage';

import { RunScanInput } from './dto/run-scan.input';

const RAW_OUTPUT_PRESIGN_TTL_SECONDS = 3600;

export interface RawOutputPresignedUrl {
  url: string;
  key: string;
  expiresInSeconds: number;
}

@Injectable()
export class ScansService {
  private readonly logger = new Logger(ScansService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ScannerRegistry) private readonly registry: ScannerRegistry,
    @InjectQueue(QueueName.SCAN_JOBS) private readonly scanQueue: Queue<ScanJobPayload>,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  async runScan(userId: string, input: RunScanInput): Promise<Scan> {
    if (!this.registry.has(input.scannerName)) {
      throw new ValidationError(`Unknown scanner: ${input.scannerName}`);
    }
    const scanner = this.registry.get(input.scannerName);

    const engagement = await this.prisma.engagement.findFirst({
      where: { id: input.engagementId, ownerId: userId, deletedAt: null },
      select: { id: true },
    });
    if (!engagement) {
      throw new NotFoundError('Engagement', input.engagementId);
    }

    const rawOptions = this.parseOptions(input.optionsJson);
    const parsedInput = this.validateScannerInput(scanner, rawOptions);

    const agentId = input.agentId ?? null;

    if (agentId) {
      const agent = await this.prisma.agent.findFirst({
        where: { id: agentId, createdById: userId, status: { in: ['ACTIVE', 'IDLE'] } },
      });
      if (!agent) {
        throw new NotFoundError('Agent', agentId);
      }
    }

    // Atomic: either both Scan and ScanJob land, or neither does. Without
    // the transaction, a failure between the two creates leaves an orphan
    // Scan with no jobs that the UI would render as "stuck QUEUED".
    const { scan, scanJob } = await this.prisma.$transaction(async (tx) => {
      const scan = await tx.scan.create({
        data: {
          engagementId: input.engagementId,
          createdById: userId,
          name: input.name ?? null,
          status: 'QUEUED',
        },
      });
      const scanJob = await tx.scanJob.create({
        data: {
          scanId: scan.id,
          scannerName: scanner.name,
          target: input.target,
          input: parsedInput as never,
          status: 'QUEUED',
          queuedAt: new Date(),
          ...(agentId ? { agentId } : {}),
        },
      });
      return { scan, scanJob };
    });

    if (!agentId) {
      const payload: ScanJobPayload = {
        scanJobId: scanJob.id,
        scannerName: scanner.name,
        target: input.target,
        input: parsedInput as Record<string, unknown>,
        engagementId: input.engagementId,
      };

      try {
        await this.scanQueue.add('scan', payload);
      } catch (err) {
        // The DB rows are already committed; if the enqueue fails (Redis
        // unavailable, queue rejected the job, etc.) we must mark both rows
        // FAILED so the UI doesn't show a phantom QUEUED scan that no worker
        // will ever pick up. Update errors don't propagate to the caller —
        // the original enqueue error must surface intact — but we log them at
        // warn so an operator hit by Redis-down *and* DB-flake at once still
        // sees both signals instead of just the BullMQ failure.
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to enqueue scan=${scan.id} job=${scanJob.id}: ${message}`);
        const [scanUpdate, scanJobUpdate] = await Promise.allSettled([
          this.prisma.scan.update({ where: { id: scan.id }, data: { status: 'FAILED' } }),
          this.prisma.scanJob.update({
            where: { id: scanJob.id },
            data: { status: 'FAILED', errorMessage: `enqueue failed: ${message}` },
          }),
        ]);
        if (scanUpdate.status === 'rejected') {
          this.logger.warn(
            `scan=${scan.id} FAILED-status reconciliation failed: ${(scanUpdate.reason as Error).message}`,
          );
        }
        if (scanJobUpdate.status === 'rejected') {
          this.logger.warn(
            `scanJob=${scanJob.id} FAILED-status reconciliation failed: ${(scanJobUpdate.reason as Error).message}`,
          );
        }
        throw err;
      }
      this.logger.log(`Enqueued scanJob=${scanJob.id} scanner=${scanner.name}`);
    } else {
      this.logger.log(
        `Agent-routed scanJob=${scanJob.id} agent=${agentId} scanner=${scanner.name}`,
      );
    }

    return scan;
  }

  listForOwner(userId: string, engagementId: string): Promise<Scan[]> {
    return this.prisma.scan.findMany({
      where: {
        engagementId,
        engagement: { ownerId: userId, deletedAt: null },
      },
      orderBy: { createdAt: 'desc' },
      include: { jobs: true },
    }) as Promise<Scan[]>;
  }

  async getForOwner(userId: string, id: string): Promise<Scan> {
    const scan = await this.prisma.scan.findFirst({
      where: { id, engagement: { ownerId: userId, deletedAt: null } },
      include: { jobs: true },
    });
    if (!scan) throw new NotFoundError('Scan', id);
    return scan as Scan;
  }

  async countFindingsForJob(scanJobId: string): Promise<number> {
    return this.prisma.finding.count({ where: { scanJobId } });
  }

  async getRawOutputPresignedUrl(
    userId: string,
    scanJobId: string,
  ): Promise<RawOutputPresignedUrl> {
    const job = await this.prisma.scanJob.findFirst({
      where: {
        id: scanJobId,
        scan: { engagement: { ownerId: userId, deletedAt: null } },
      },
      select: { id: true, rawOutputKey: true },
    });
    if (!job) throw new NotFoundError('ScanJob', scanJobId);
    if (!job.rawOutputKey) throw new NotFoundError('RawOutput', scanJobId);

    const url = await this.storage.presignGetUrl({
      bucket: 'raw-outputs',
      key: job.rawOutputKey,
      expiresInSeconds: RAW_OUTPUT_PRESIGN_TTL_SECONDS,
    });
    return { url, key: job.rawOutputKey, expiresInSeconds: RAW_OUTPUT_PRESIGN_TTL_SECONDS };
  }

  private parseOptions(optionsJson: string | undefined): unknown {
    if (!optionsJson || !optionsJson.trim()) return {};
    try {
      return JSON.parse(optionsJson);
    } catch (err) {
      throw new ValidationError('optionsJson must be valid JSON', (err as Error).message);
    }
  }

  private validateScannerInput(
    scanner: {
      name: string;
      inputSchema: {
        safeParse: (v: unknown) => { success: boolean; data?: unknown; error?: ZodError };
      };
    },
    raw: unknown,
  ): unknown {
    const result = scanner.inputSchema.safeParse(raw);
    if (!result.success) {
      throw new ValidationError(
        `Invalid options for scanner "${scanner.name}"`,
        result.error?.flatten(),
      );
    }
    return result.data;
  }
}
