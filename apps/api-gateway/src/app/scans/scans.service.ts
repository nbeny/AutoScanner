import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ZodError } from 'zod';
import type { Scan } from '@prisma/client';
import { NotFoundError, ValidationError } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';
import { QueueName, type ScanJobPayload } from '@autoscanner/queues';
import { ScannerRegistry } from '@autoscanner/scanner-sdk';

import { RunScanInput } from './dto/run-scan.input';

@Injectable()
export class ScansService {
  private readonly logger = new Logger(ScansService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ScannerRegistry) private readonly registry: ScannerRegistry,
    @InjectQueue(QueueName.SCAN_JOBS) private readonly scanQueue: Queue<ScanJobPayload>,
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

    const scan = await this.prisma.scan.create({
      data: {
        engagementId: input.engagementId,
        createdById: userId,
        name: input.name ?? null,
        status: 'QUEUED',
      },
    });

    const scanJob = await this.prisma.scanJob.create({
      data: {
        scanId: scan.id,
        scannerName: scanner.name,
        target: input.target,
        input: parsedInput as never,
        status: 'QUEUED',
        queuedAt: new Date(),
      },
    });

    const payload: ScanJobPayload = {
      scanJobId: scanJob.id,
      scannerName: scanner.name,
      target: input.target,
      input: parsedInput as Record<string, unknown>,
      engagementId: input.engagementId,
    };
    await this.scanQueue.add('scan', payload);
    this.logger.log(`Enqueued scanJob=${scanJob.id} scanner=${scanner.name}`);

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
