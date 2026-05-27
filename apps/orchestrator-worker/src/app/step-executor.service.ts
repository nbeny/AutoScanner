import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';

import { PrismaService } from '@autoscanner/database';
import { QueueName, type ScanJobPayload } from '@autoscanner/queues';
import { ScannerRegistry } from '@autoscanner/scanner-sdk';
import type { ContextRef, TemplateStep } from '@autoscanner/templates';

import { ContextBuilder, type TemplateRunLike } from './context-builder.service';
import {
  ORCHESTRATOR_REDIS_SUBSCRIBER,
  type OrchestratorRedisSubscriber,
  scanJobDoneChannel,
} from './orchestrator-redis.tokens';

/** Default polling interval (ms) between ScanJob status checks. */
const DEFAULT_POLL_INTERVAL_MS = 5_000;
/** Extra time on top of the scanner's docker timeout before we give up. */
const STEP_TIMEOUT_GRACE_MS = 60_000;

const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'TIMEOUT', 'CANCELLED']);

/** Thrown by {@link StepExecutor} when a single ScanJob exceeds the step budget. */
export class StepTimeoutError extends Error {
  constructor(
    public readonly scanJobId: string,
    public readonly budgetMs: number,
  ) {
    super(`ScanJob ${scanJobId} did not reach a terminal status within ${budgetMs}ms`);
    this.name = 'StepTimeoutError';
  }
}

/**
 * Thrown by {@link StepExecutor} when a ScanJob lands in a non-COMPLETED
 * terminal status (FAILED / TIMEOUT / CANCELLED). The
 * {@link TemplateRunProcessor} catches this and marks the run FAILED.
 */
export class StepFailedError extends Error {
  constructor(
    public readonly scanJobId: string,
    public readonly status: string,
    public readonly cause?: string,
  ) {
    super(`ScanJob ${scanJobId} finished with status=${status}${cause ? `: ${cause}` : ''}`);
    this.name = 'StepFailedError';
  }
}

export interface StepExecutorOptions {
  /** Override polling interval. Defaults to 5_000 ms. */
  pollIntervalMs?: number;
}

export interface RunStepArgs {
  templateRun: TemplateRunLike & { createdById: string };
  step: TemplateStep;
  stepIndex: number;
}

/**
 * Executes a single template step:
 *
 * 1. Resolves `step.target` into a concrete target list via {@link ContextBuilder}.
 * 2. For each target: creates a `Scan` row, then a `ScanJob` row (PENDING),
 *    enqueues on the `SCAN_JOBS` BullMQ queue.
 * 3. Waits for every enqueued ScanJob to reach a terminal status.
 *
 * **Completion strategy**: we subscribe to the Redis pub/sub channel
 * `scanjob:done:<scanJobId>` AND poll `prisma.scanJob.findUnique` every
 * `pollIntervalMs`. Whichever fires first wins. **Note (Phase 2)**: nothing
 * publishes to `scanjob:done:*` today — the subscribe is a future-proof hook
 * intended for a later push-based completion signal. Polling is the
 * load-bearing path. The polling promise resolves as soon as
 * `scanJob.status` is in `{COMPLETED, FAILED, TIMEOUT, CANCELLED}`.
 *
 * **Timeout**: per ScanJob, we cap the wait at
 * `scanner.docker.defaultTimeoutMs + 60_000` (the 60s grace covers Docker
 * startup, BullMQ pickup latency, and the parser-worker race). Exceeding it
 * throws {@link StepTimeoutError} and aborts the chain.
 *
 * **Failure propagation**: any ScanJob landing in FAILED/TIMEOUT/CANCELLED
 * causes {@link StepFailedError} to bubble up; the processor turns the
 * `TemplateRun` to FAILED.
 */
@Injectable()
export class StepExecutor {
  private readonly logger = new Logger(StepExecutor.name);
  private readonly pollIntervalMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ScannerRegistry,
    @InjectQueue(QueueName.SCAN_JOBS) private readonly scanQueue: Queue<ScanJobPayload>,
    @Inject(ORCHESTRATOR_REDIS_SUBSCRIBER)
    private readonly redis: OrchestratorRedisSubscriber,
    private readonly contextBuilder: ContextBuilder,
    @Optional() options?: StepExecutorOptions,
  ) {
    this.pollIntervalMs = options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  }

  async runStep(args: RunStepArgs): Promise<void> {
    const { templateRun, step, stepIndex } = args;
    const targets = await this.contextBuilder.buildTargets(step, templateRun, stepIndex);

    if (targets.length === 0) {
      this.logger.warn(
        `Step ${stepIndex} (${step.scannerName}): no targets resolved and D3 fallback inapplicable — skipping`,
      );
      return;
    }

    const scannerDef = this.registry.get(step.scannerName);
    const budgetMs = scannerDef.docker.defaultTimeoutMs + STEP_TIMEOUT_GRACE_MS;
    const inputs = this.extractStaticInputs(step.inputs);

    this.logger.log(
      `Step ${stepIndex} (${step.scannerName}): enqueuing ${targets.length} ScanJob(s) ` +
        `(engagement=${templateRun.engagementId}, budgetMs=${budgetMs})`,
    );

    // Enqueue all ScanJobs (one per target) and wait for all in parallel.
    // The chain fails if ANY job lands in a non-COMPLETED terminal status.
    const waits = await Promise.all(
      targets.map((target) =>
        this.createAndEnqueueScanJob({
          templateRun,
          step,
          stepIndex,
          target,
          input: inputs,
        }),
      ),
    );

    // Wait for every ScanJob to finish. Promise.all rejects on the first
    // failure, which aborts the chain. Other in-flight jobs continue to
    // execute but their results are ignored at this layer (the scan-worker
    // still records terminal status correctly).
    await Promise.all(
      waits.map(({ scanJobId }) => this.awaitScanJobCompletion(scanJobId, budgetMs)),
    );
  }

  private extractStaticInputs(inputs: Record<string, ContextRef>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, ref] of Object.entries(inputs)) {
      if (ref.kind === 'static') {
        result[key] = ref.value;
      }
      // Phase 2: `kind=context` inputs are ignored — Phase 3+ territory.
    }
    return result;
  }

  private async createAndEnqueueScanJob(args: {
    templateRun: TemplateRunLike & { createdById: string };
    step: TemplateStep;
    stepIndex: number;
    target: string;
    input: Record<string, unknown>;
  }): Promise<{ scanJobId: string }> {
    const { templateRun, step, stepIndex, target, input } = args;

    const scan = await this.prisma.scan.create({
      data: {
        engagementId: templateRun.engagementId,
        createdById: templateRun.createdById,
        templateRunId: templateRun.id,
        stepIndex,
        name: `${step.scannerName}-step-${stepIndex}`,
      },
    });

    const scanJob = await this.prisma.scanJob.create({
      data: {
        scanId: scan.id,
        scannerName: step.scannerName,
        target,
        input: input as Prisma.InputJsonValue,
        queuedAt: new Date(),
      },
    });

    const payload: ScanJobPayload = {
      scanJobId: scanJob.id,
      scannerName: step.scannerName,
      target,
      input,
      engagementId: templateRun.engagementId,
    };

    await this.scanQueue.add('scan', payload);
    return { scanJobId: scanJob.id };
  }

  /**
   * Resolves when ScanJob.status is terminal-COMPLETED. Rejects with
   * {@link StepFailedError} for any other terminal status, or
   * {@link StepTimeoutError} on overall budget exceeded.
   *
   * Combines Redis pub/sub (push, future hook) with a setInterval poll
   * (pull, load-bearing today). The subscribe is best-effort — failures are
   * logged but not fatal.
   */
  private awaitScanJobCompletion(scanJobId: string, budgetMs: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const channel = scanJobDoneChannel(scanJobId);

      let pollTimer: ReturnType<typeof setInterval> | null = null;
      let budgetTimer: ReturnType<typeof setTimeout> | null = null;

      const cleanup = (): void => {
        if (pollTimer) clearInterval(pollTimer);
        if (budgetTimer) clearTimeout(budgetTimer);
        try {
          this.redis.off('message', onMessage);
        } catch {
          // ignore — best effort
        }
        void this.redis.unsubscribe(channel).catch(() => {
          // ignore — best effort
        });
      };

      const finishOk = (): void => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };

      const finishErr = (err: Error): void => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      };

      const onMessage = (incomingChannel: string, _msg: string): void => {
        if (incomingChannel !== channel) return;
        // Push notification: re-query DB for the authoritative status.
        void this.checkOnce(scanJobId, finishOk, finishErr);
      };

      try {
        this.redis.on('message', onMessage);
      } catch (err) {
        this.logger.warn(
          `Redis on('message') hook failed for ${scanJobId}: ${(err as Error).message}`,
        );
      }

      void this.redis.subscribe(channel).catch((err) => {
        // Subscribe failure is non-fatal: polling will still resolve.
        this.logger.warn(
          `Redis subscribe(${channel}) failed: ${(err as Error).message} — relying on polling`,
        );
      });

      pollTimer = setInterval(() => {
        void this.checkOnce(scanJobId, finishOk, finishErr);
      }, this.pollIntervalMs);

      budgetTimer = setTimeout(() => {
        finishErr(new StepTimeoutError(scanJobId, budgetMs));
      }, budgetMs);
    });
  }

  private async checkOnce(
    scanJobId: string,
    finishOk: () => void,
    finishErr: (err: Error) => void,
  ): Promise<void> {
    let row: { id: string; status: string; errorMessage?: string | null } | null;
    try {
      row = (await this.prisma.scanJob.findUnique({
        where: { id: scanJobId },
      })) as { id: string; status: string; errorMessage?: string | null } | null;
    } catch (err) {
      // Transient DB error — don't tear down the wait; next poll will retry.
      this.logger.warn(`scanJob ${scanJobId} status poll failed: ${(err as Error).message}`);
      return;
    }
    if (!row) return;
    if (!TERMINAL_STATUSES.has(row.status)) return;
    if (row.status === 'COMPLETED') {
      finishOk();
      return;
    }
    finishErr(new StepFailedError(scanJobId, row.status, row.errorMessage ?? undefined));
  }
}
