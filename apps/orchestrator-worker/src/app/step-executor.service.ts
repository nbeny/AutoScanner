import { Inject, Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '@autoscanner/database';
import { type ScanJobPayload } from '@autoscanner/queues';
import { JOB_BUS, type JobBus } from '@autoscanner/messaging';
import { ScannerRegistry } from '@autoscanner/scanner-sdk';
import type { ContextRef, TemplateStep } from '@autoscanner/templates';

import { ContextBuilder, type TemplateRunLike } from './context-builder.service';
import {
  ORCHESTRATOR_REDIS_SUBSCRIBER,
  type OrchestratorRedisSubscriber,
  scanJobDoneChannel,
} from './orchestrator-redis.tokens';

const SCANNER_TOPIC = 'security.scanner.requested';

/**
 * Fallback poll interval (ms). Since SP3 the `scanjob:done` push is the primary completion path;
 * this poll only catches a lost at-most-once Redis message, so it is a slow safety net (30 s)
 * rather than the old 5 s hot loop. Overridable via `SCANJOB_DONE_FALLBACK_POLL_MS`.
 */
const DEFAULT_FALLBACK_POLL_MS = Number(process.env['SCANJOB_DONE_FALLBACK_POLL_MS']) || 30_000;
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

/** Thrown internally to abort an in-flight wait when a sibling ScanJob has
 * already rejected. Never escapes `runStep` (caught at the per-target
 * boundary so the original sibling rejection is what Promise.all surfaces). */
class WaitAbortedError extends Error {
  constructor() {
    super('wait aborted');
    this.name = 'WaitAbortedError';
  }
}

export interface StepExecutorOptions {
  /** Override the fallback poll interval. Defaults to 30 s (SP3); tests inject a small value. */
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
 * 2. For each target: pre-generates the `ScanJob.id`, subscribes to the
 *    completion channel FIRST, then creates the `Scan` + `ScanJob` rows
 *    inside a single Prisma `$transaction`, then enqueues on the `SCAN_JOBS`
 *    BullMQ queue.
 * 3. Waits for every enqueued ScanJob to reach a terminal status.
 *
 * **Completion strategy**: we subscribe to the Redis pub/sub channel
 * `scanjob:done:<scanJobId>` AND poll `prisma.scanJob.findUnique` every
 * `pollIntervalMs`. Whichever fires first wins. **Since SP3** scan-worker
 * publishes `scanjob:done:*` on every terminal outcome, so the push is the
 * primary path and the poll is a 30 s lost-message fallback (Redis pub/sub is
 * at-most-once). The wait resolves as soon as `scanJob.status` is in
 * `{COMPLETED, FAILED, TIMEOUT, CANCELLED}`.
 *
 * **Subscribe-before-create**: the subscribe must complete *before* the row
 * exists so any future publisher emitting between row insert and subscribe
 * is not lost. We pre-generate the ScanJob id via `randomUUID()` so the
 * channel name is known before the row is created. Prisma accepts an explicit
 * `id` (it overrides the `@default(cuid())` only when the field is provided).
 *
 * **Atomic row creation**: `Scan` and `ScanJob` are created in a single
 * `prisma.$transaction(async tx => ...)`. If the ScanJob insert fails the
 * Scan row is rolled back instead of being orphaned.
 *
 * **Cancellation on sibling failure**: parallel waits share an
 * `AbortController`. As soon as one ScanJob rejects, the controller is
 * aborted so the other in-flight waits tear down their timers + Redis
 * subscription instead of waiting out the full step budget.
 *
 * **Timeout**: per ScanJob, we cap the wait at
 * `scanner.docker.defaultTimeoutMs + 60_000` (the 60s grace covers Docker
 * startup, BullMQ pickup latency, and the parser-worker race). Exceeding it
 * throws {@link StepTimeoutError} and aborts the chain.
 *
 * **Failure propagation**: any ScanJob landing in FAILED/TIMEOUT/CANCELLED
 * causes {@link StepFailedError} to bubble up; the processor turns the
 * `TemplateRun` to FAILED.
 *
 * **Lifecycle**: the injected Redis subscriber is `quit()`-ed in
 * {@link onModuleDestroy} so SIGTERM cleanly closes the connection.
 */
@Injectable()
export class StepExecutor implements OnModuleDestroy {
  private readonly logger = new Logger(StepExecutor.name);
  private readonly pollIntervalMs: number;
  // Single shared `message` listener + per-channel dispatch map. Previously we
  // attached one `redis.on('message', ...)` per in-flight dispatch, which made
  // a wide fan-out (e.g. naabu over a /24) trip Node's default 10-listener cap
  // and required `setMaxListeners(0)` as a band-aid. With a single listener
  // the cap is irrelevant and there's no per-dispatch listener leak risk.
  private readonly channelHandlers = new Map<string, () => void>();
  private listenerBound = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ScannerRegistry,
    @Inject(JOB_BUS) private readonly bus: JobBus,
    @Inject(ORCHESTRATOR_REDIS_SUBSCRIBER)
    private readonly redis: OrchestratorRedisSubscriber,
    private readonly contextBuilder: ContextBuilder,
    @Optional() options?: StepExecutorOptions,
  ) {
    this.pollIntervalMs = options?.pollIntervalMs ?? DEFAULT_FALLBACK_POLL_MS;
  }

  private bindListenerOnce(): void {
    if (this.listenerBound) return;
    this.listenerBound = true;
    this.redis.on('message', (channel: string) => {
      // No payload parsing — the `scanjob:done:<id>` push is just a wake-up;
      // `checkOnce` always re-reads the authoritative status from Postgres.
      this.channelHandlers.get(channel)?.();
    });
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.redis.quit();
    } catch (err) {
      // SIGTERM path — best-effort.
      this.logger.warn(`Redis subscriber quit() failed: ${(err as Error).message}`);
    }
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

    // Shared AbortController: as soon as ONE target rejects we abort the
    // siblings so their pollTimer + budgetTimer + Redis subscription tear
    // down instead of running to the full budget (I1).
    const controller = new AbortController();
    try {
      await Promise.all(
        targets.map((target) =>
          this.dispatchOne({
            templateRun,
            step,
            stepIndex,
            target,
            input: inputs,
            budgetMs,
            signal: controller.signal,
          }),
        ),
      );
    } finally {
      // Cleanup on success too — ensures no listener leaks even on the happy path.
      controller.abort();
    }
  }

  /**
   * End-to-end dispatch of a single target: subscribe -> create rows in tx
   * -> enqueue -> wait. Enforces the subscribe-before-create ordering
   * required to make the future pub/sub publisher race-free (C1).
   */
  private async dispatchOne(args: {
    templateRun: TemplateRunLike & { createdById: string };
    step: TemplateStep;
    stepIndex: number;
    target: string;
    input: Record<string, unknown>;
    budgetMs: number;
    signal: AbortSignal;
  }): Promise<void> {
    const { templateRun, step, stepIndex, target, input, budgetMs, signal } = args;

    // Pre-generate the ScanJob id so we can subscribe to its channel before
    // the row exists. Prisma accepts an explicit `id` and skips the
    // `@default(cuid())` when one is provided.
    const scanJobId = randomUUID();
    const channel = scanJobDoneChannel(scanJobId);

    // Capture the wait's settlement callbacks so the shared `message`
    // dispatcher can drive them once the row exists.
    let finishOk: () => void = () => undefined;
    let finishErr: (err: Error) => void = () => undefined;

    this.bindListenerOnce();
    // Register the per-channel handler BEFORE subscribe so any future publisher
    // emitting between subscribe and row-creation is dispatched correctly.
    this.channelHandlers.set(channel, () => {
      // Push notification: re-query DB for the authoritative status.
      void this.checkOnce(scanJobId, finishOk, finishErr);
    });

    // SUBSCRIBE FIRST (C1) — await so any publisher emitting after this
    // point is delivered. Failure is non-fatal: polling is load-bearing.
    try {
      await this.redis.subscribe(channel);
    } catch (err) {
      this.logger.warn(
        `Redis subscribe(${channel}) failed: ${(err as Error).message} — relying on polling`,
      );
    }

    // C2: Create Scan + ScanJob rows in a SINGLE transaction so a failure
    // on the ScanJob insert rolls back the Scan row instead of orphaning it.
    let scanId: string;
    try {
      scanId = await this.prisma.$transaction(async (tx) => {
        const scan = await tx.scan.create({
          data: {
            engagementId: templateRun.engagementId,
            createdById: templateRun.createdById,
            templateRunId: templateRun.id,
            stepIndex,
            name: `${step.scannerName}-step-${stepIndex}`,
          },
        });
        await tx.scanJob.create({
          data: {
            id: scanJobId,
            scanId: scan.id,
            scannerName: step.scannerName,
            target,
            input: input as Prisma.InputJsonValue,
            queuedAt: new Date(),
          },
        });
        return scan.id;
      });
    } catch (err) {
      // Row creation failed — tear down the subscription we opened above
      // and rethrow. There's nothing to wait for.
      this.channelHandlers.delete(channel);
      await this.safeUnsubscribe(channel);
      throw err;
    }

    // Enqueue on the BullMQ queue *after* the row exists so the scan-worker
    // never picks up a job whose row isn't visible.
    const payload: ScanJobPayload = {
      scanJobId,
      scannerName: step.scannerName,
      target,
      input,
      engagementId: templateRun.engagementId,
    };
    try {
      await this.bus.publish<ScanJobPayload>(SCANNER_TOPIC, scanJobId, payload);
    } catch (err) {
      // Mirrors the api-gateway ScansService reconciliation path: the DB
      // rows are already committed; if the enqueue fails (Redis down, queue
      // rejected the job, etc.) we mark both rows FAILED so the operator
      // doesn't see a phantom QUEUED scan that no worker will ever pick up.
      // The polling wait would only catch this after the full step budget
      // (often >10 min), so reconciling here keeps the UI honest. Updates
      // are best-effort; the original enqueue error must surface intact.
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to enqueue scanJob=${scanJobId} scanner=${step.scannerName} step=${stepIndex}: ${message}`,
      );
      const [scanUpdate, scanJobUpdate] = await Promise.allSettled([
        this.prisma.scan.update({ where: { id: scanId }, data: { status: 'FAILED' } }),
        this.prisma.scanJob.update({
          where: { id: scanJobId },
          data: { status: 'FAILED', errorMessage: `enqueue failed: ${message}` },
        }),
      ]);
      if (scanUpdate.status === 'rejected') {
        this.logger.warn(
          `scan=${scanId} FAILED-status reconciliation failed: ${(scanUpdate.reason as Error).message}`,
        );
      }
      if (scanJobUpdate.status === 'rejected') {
        this.logger.warn(
          `scanJob=${scanJobId} FAILED-status reconciliation failed: ${(scanJobUpdate.reason as Error).message}`,
        );
      }
      this.channelHandlers.delete(channel);
      await this.safeUnsubscribe(channel);
      throw err;
    }

    // Wait for completion (poll + push). Honours the shared AbortSignal:
    // when a sibling rejects, the controller aborts and this promise
    // settles immediately by clearing its timers + unsubscribing.
    return this.awaitScanJobCompletion({
      scanJobId,
      channel,
      budgetMs,
      signal,
      bindCallbacks: (ok, err) => {
        finishOk = ok;
        finishErr = err;
      },
    });
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

  /**
   * Runs the polling + Redis-push wait for a single ScanJob whose subscribe
   * + row have already been done by {@link dispatchOne}.
   *
   * Resolves when `ScanJob.status === COMPLETED`. Rejects with
   * {@link StepFailedError} on any other terminal status,
   * {@link StepTimeoutError} on budget exceeded. {@link WaitAbortedError}
   * (raised when `signal` aborts before settlement) is swallowed here so it
   * never escapes `runStep` — the original sibling rejection is what
   * Promise.all surfaces to the caller.
   */
  private awaitScanJobCompletion(args: {
    scanJobId: string;
    channel: string;
    budgetMs: number;
    signal: AbortSignal;
    bindCallbacks: (ok: () => void, err: (err: Error) => void) => void;
  }): Promise<void> {
    const { scanJobId, channel, budgetMs, signal, bindCallbacks } = args;

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let pollTimer: ReturnType<typeof setInterval> | null = null;
      let budgetTimer: ReturnType<typeof setTimeout> | null = null;
      let abortListener: (() => void) | null = null;

      const cleanup = (): void => {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = null;
        if (budgetTimer) clearTimeout(budgetTimer);
        budgetTimer = null;
        if (abortListener) {
          try {
            signal.removeEventListener('abort', abortListener);
          } catch {
            // ignore — best effort
          }
          abortListener = null;
        }
        this.channelHandlers.delete(channel);
        void this.safeUnsubscribe(channel);
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
        // Swallow WaitAbortedError at the boundary so it never bubbles to
        // Promise.all (the original sibling rejection is the real cause).
        if (err instanceof WaitAbortedError) {
          resolve();
          return;
        }
        reject(err);
      };

      // Hand the callbacks back to dispatchOne so the shared message
      // dispatcher can drive completion via the channelHandlers map.
      bindCallbacks(finishOk, finishErr);

      // I1: sibling-failure cancellation. If the shared AbortController is
      // already aborted (race: a sibling rejected during our subscribe / tx
      // / enqueue), or aborts later, tear everything down.
      if (signal.aborted) {
        finishErr(new WaitAbortedError());
        return;
      }
      abortListener = (): void => finishErr(new WaitAbortedError());
      signal.addEventListener('abort', abortListener, { once: true });

      pollTimer = setInterval(() => {
        void this.checkOnce(scanJobId, finishOk, finishErr);
      }, this.pollIntervalMs);

      budgetTimer = setTimeout(() => {
        finishErr(new StepTimeoutError(scanJobId, budgetMs));
      }, budgetMs);
    });
  }

  private async safeUnsubscribe(channel: string): Promise<void> {
    try {
      await this.redis.unsubscribe(channel);
    } catch {
      // ignore — best effort
    }
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
