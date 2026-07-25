import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import type { Scan, ScanJob } from '@prisma/client';
import { NotFoundError, ValidationError } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';
import { CapabilityService, ACTIVE_RECON_HOST_NET, ACTIVE_MAIL_PROBE } from '@autoscanner/auth';
import { QueueName, type ScanJobPayload } from '@autoscanner/queues';
import { ScannerRegistry } from '@autoscanner/scanner-sdk';
import { OBJECT_STORAGE, type ObjectStorage } from '@autoscanner/storage';
import {
  ENGAGEMENT_EVENTS_PUBLISHER,
  EngagementUpdateKind,
  type EngagementEventsPublisher,
} from '@autoscanner/engagement-events';

import { RunScanInput } from './dto/run-scan.input';
import { ScansFilterInput } from './dto/scans-filter.input';
import { ScanControlPublisher } from './scan-control.publisher';

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
    private readonly scanControl: ScanControlPublisher,
    @Inject(ENGAGEMENT_EVENTS_PUBLISHER) private readonly events: EngagementEventsPublisher,
    private readonly capabilities: CapabilityService,
  ) {}

  async runScan(userId: string, input: RunScanInput): Promise<Scan> {
    if (!this.registry.has(input.scannerName)) {
      throw new ValidationError(`Unknown scanner: ${input.scannerName}`);
    }
    const scanner = this.registry.get(input.scannerName);

    if (scanner.name === 'ike-scan') {
      const allowed = await this.capabilities.has(userId, ACTIVE_RECON_HOST_NET);
      if (!allowed) {
        throw new ValidationError(
          'Scanner ike-scan requires the active-recon-host-net capability.',
        );
      }
    }

    if (scanner.name === 'swaks') {
      const allowed = await this.capabilities.has(userId, ACTIVE_MAIL_PROBE);
      if (!allowed) {
        throw new ValidationError('Scanner swaks requires the active-mail-probe capability.');
      }
    }

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

  async listAllForOwner(userId: string, filter?: ScansFilterInput) {
    const where: Prisma.ScanWhereInput = {
      engagement: { ownerId: userId, deletedAt: null },
    };
    if (filter?.statusIn?.length) where.status = { in: filter.statusIn };
    else if (filter?.status) where.status = filter.status;
    if (filter?.engagementId) where.engagementId = filter.engagementId;
    if (filter?.scannerName) where.jobs = { some: { scannerName: filter.scannerName } };
    return this.prisma.scan.findMany({
      where,
      include: { jobs: true },
      orderBy: { createdAt: 'desc' },
      take: filter?.limit ?? 50,
      skip: filter?.offset ?? 0,
    });
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

  async cancelScanJob(userId: string, jobId: string): Promise<ScanJob> {
    const job = await this.prisma.scanJob.findFirst({
      where: {
        id: jobId,
        scan: { engagement: { ownerId: userId, deletedAt: null } },
      },
      include: { scan: { include: { engagement: true } } },
    });
    if (!job) throw new NotFoundError('ScanJob', jobId);

    if (this.isTerminal(job.status)) {
      return job as ScanJob;
    }

    if (job.status === 'QUEUED') {
      try {
        const bullJob = await this.scanQueue.getJob(jobId);
        if (bullJob) await bullJob.remove();
      } catch {
        // safe to ignore — job may not exist in the queue
      }
    }

    const updated = await this.prisma.scanJob.update({
      where: { id: jobId },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });

    await this.scanControl.publishCancel(jobId);

    const engagementId = (job as any).scan.engagementId;
    await this.events.publish({
      kind: EngagementUpdateKind.SCAN_JOB_STATUS_CHANGED,
      engagementId,
      scanJobId: jobId,
      ts: new Date().toISOString(),
    });

    return updated as ScanJob;
  }

  async retryScanJob(userId: string, jobId: string): Promise<Scan> {
    const job = await this.prisma.scanJob.findFirst({
      where: { id: jobId, scan: { engagement: { ownerId: userId, deletedAt: null } } },
      include: { scan: true },
    });
    if (!job) throw new NotFoundError('ScanJob', jobId);
    return this.runScan(userId, {
      engagementId: (job as any).scan.engagementId,
      scannerName: job.scannerName,
      target: job.target,
      optionsJson: JSON.stringify((job as any).input ?? {}),
    });
  }

  async retryScan(userId: string, scanId: string): Promise<Scan> {
    const scan = await this.prisma.scan.findFirst({
      where: { id: scanId, engagement: { ownerId: userId, deletedAt: null } },
      include: { jobs: true },
    });
    if (!scan) throw new NotFoundError('Scan', scanId);
    const jobs = (scan as any).jobs as Array<{ id: string }>;
    if (jobs.length === 0) throw new NotFoundError('ScanJob', scanId);
    // Re-run each original job; return the first new scan (multi-job → multiple new scans).
    const results = await Promise.all(jobs.map((j) => this.retryScanJob(userId, j.id)));
    return results[0];
  }

  async cancelScan(userId: string, scanId: string): Promise<Scan> {
    const scan = await this.prisma.scan.findFirst({
      where: { id: scanId, engagement: { ownerId: userId, deletedAt: null } },
      include: { jobs: true },
    });
    if (!scan) throw new NotFoundError('Scan', scanId);

    const nonTerminalJobs = ((scan as any).jobs as Array<{ id: string; status: string }>).filter(
      (j) => !this.isTerminal(j.status),
    );

    await Promise.all(nonTerminalJobs.map((j) => this.cancelScanJob(userId, j.id)));

    const updated = await this.prisma.scan.update({
      where: { id: scanId },
      data: { status: 'CANCELLED' },
      include: { jobs: true },
    });

    return updated as Scan;
  }

  async cancelAllScans(userId: string, engagementId: string): Promise<number> {
    const scans = await this.prisma.scan.findMany({
      where: {
        engagementId,
        engagement: { ownerId: userId, deletedAt: null },
        status: { notIn: ['COMPLETED', 'FAILED', 'CANCELLED'] },
      },
      select: { id: true },
    });

    let cancelled = 0;
    for (const scan of scans) {
      try {
        await this.cancelScan(userId, scan.id);
        cancelled++;
      } catch (err) {
        this.logger.warn(`cancelAllScans: failed to cancel ${scan.id}: ${(err as Error).message}`);
      }
    }
    return cancelled;
  }

  private isTerminal(status: string): boolean {
    return ['COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT'].includes(status);
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
