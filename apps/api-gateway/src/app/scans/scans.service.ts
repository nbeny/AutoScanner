import { Inject, Injectable, Logger } from '@nestjs/common';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import type { Scan, ScanJob } from '@prisma/client';
import { NotFoundError, ValidationError } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';
import { CapabilityService, ACTIVE_RECON_HOST_NET, ACTIVE_MAIL_PROBE } from '@autoscanner/auth';
import { type ScanJobPayload } from '@autoscanner/queues';
import { JOB_BUS, type JobBus } from '@autoscanner/messaging';
import { EXTRA_ARGS_KEY, sanitizeExtraArgs, ScannerRegistry } from '@autoscanner/scanner-sdk';
import { OBJECT_STORAGE, scanLogKey, type ObjectStorage } from '@autoscanner/storage';
import {
  ENGAGEMENT_EVENTS_PUBLISHER,
  EngagementUpdateKind,
  type EngagementEventsPublisher,
} from '@autoscanner/engagement-events';

import { RunScanInput } from './dto/run-scan.input';
import { ScansFilterInput } from './dto/scans-filter.input';
import { ScanControlPublisher } from './scan-control.publisher';

const SCANNER_TOPIC = 'security.scanner.requested';

const RAW_OUTPUT_PRESIGN_TTL_SECONDS = 3600;

// Scan/job statuses that are already final — shared by isTerminal() and the
// cancelAllScans() filter so the two can't drift apart.
const TERMINAL_SCAN_STATUSES = ['COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT'] as const;

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
    @Inject(JOB_BUS) private readonly bus: JobBus,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly scanControl: ScanControlPublisher,
    @Inject(ENGAGEMENT_EVENTS_PUBLISHER) private readonly events: EngagementEventsPublisher,
    private readonly capabilities: CapabilityService,
  ) {}

  async runScan(userId: string, input: RunScanInput): Promise<Scan & { jobs: ScanJob[] }> {
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
    const parsedInput = this.mergeValidatedInput(scanner, rawOptions);

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
        await this.bus.publish<ScanJobPayload>(SCANNER_TOPIC, scanJob.id, payload);
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

    // GraphQL's Scan.jobs is a non-nullable list, but tx.scan.create above
    // doesn't load the relation. Attach the job we just created so the runScan
    // mutation can select `jobs` without hitting
    // "Cannot return null for non-nullable field Scan.jobs".
    return { ...scan, jobs: [scanJob] };
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

    const osintNames = filter?.group ? this.registry.osintScannerNames() : null;
    if (filter?.group === 'OSINT') {
      where.jobs = { some: { scannerName: { in: osintNames! } } };
    } else if (filter?.group === 'RECON') {
      where.jobs = { some: { scannerName: { notIn: osintNames! } } };
    }

    const scans = await this.prisma.scan.findMany({
      where,
      include: { jobs: true },
      orderBy: { createdAt: 'desc' },
      take: filter?.limit ?? 50,
      skip: filter?.offset ?? 0,
    });

    // Post-filtrer les jobs affichés pour qu'un scan mixte ne montre que ses jobs du groupe.
    if (filter?.group && osintNames) {
      const osintSet = new Set(osintNames);
      const wantOsint = filter.group === 'OSINT';
      for (const scan of scans) {
        scan.jobs = scan.jobs.filter((j) => osintSet.has(j.scannerName) === wantOsint);
      }
    }
    return scans;
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

  /**
   * Lit les logs combinés persistés d'un scan job depuis MinIO (bucket `logs`).
   * Renvoie '' si aucun log n'a encore été écrit (job non démarré, ou clé absente).
   */
  async getScanJobLogs(scanJobId: string): Promise<string> {
    try {
      const { body } = await this.storage.getObject('logs', scanLogKey(scanJobId));
      const parts: Buffer[] = [];
      for await (const part of body) {
        parts.push(Buffer.isBuffer(part) ? part : Buffer.from(part as string));
      }
      return Buffer.concat(parts).toString('utf8');
    } catch {
      return '';
    }
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

    // A QUEUED job's Kafka message cannot be un-published; the scan-worker's
    // terminal-status guard skips it once it sees the CANCELLED row below.

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
        status: { notIn: [...TERMINAL_SCAN_STATUSES] },
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
    return (TERMINAL_SCAN_STATUSES as readonly string[]).includes(status);
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

  /**
   * Valide les options connues contre le schéma du scanner, tout en préservant la
   * clé hors-schéma `extraArgs` (arguments bruts) que z.object supprimerait sinon.
   */
  private mergeValidatedInput(
    scanner: Parameters<ScansService['validateScannerInput']>[0],
    raw: unknown,
  ): unknown {
    const record = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const { [EXTRA_ARGS_KEY]: rawExtra, ...known } = record;
    const validated = this.validateScannerInput(scanner, known) as Record<string, unknown>;
    const extraArgs = sanitizeExtraArgs(rawExtra);
    return extraArgs.length ? { ...validated, [EXTRA_ARGS_KEY]: extraArgs } : validated;
  }
}
