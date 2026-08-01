import { Inject, Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '@autoscanner/database';
import { type ScanJobPayload } from '@autoscanner/queues';
import { JOB_BUS, type JobBus } from '@autoscanner/messaging';
import { ScannerRegistry } from '@autoscanner/scanner-sdk';

import {
  SCAN_DISPATCH_REDIS_SUBSCRIBER,
  type ScanDispatchRedisSubscriber,
  scanJobDoneChannel,
} from './scan-dispatch.tokens';

const SCANNER_TOPIC = 'security.scanner.requested';

/**
 * Fallback poll interval (ms). Since SP3 the `scanjob:done` push is the primary completion path;
 * this poll only needs to catch a lost at-most-once Redis message, so it is a slow safety net
 * (30 s) rather than the old 5 s hot loop. Overridable via `SCANJOB_DONE_FALLBACK_POLL_MS`.
 */
const DEFAULT_FALLBACK_POLL_MS = Number(process.env['SCANJOB_DONE_FALLBACK_POLL_MS']) || 30_000;
/** Extra time on top of the scanner's docker timeout before we give up. */
const DISPATCH_TIMEOUT_GRACE_MS = 60_000;

const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'TIMEOUT', 'CANCELLED']);

/** A terminal ScanJob status as surfaced to the AI orchestrator. */
export type DispatchStatus = 'COMPLETED' | 'FAILED' | 'TIMEOUT' | 'CANCELLED';

/** One scanner dispatch request. */
export interface DispatchItem {
  engagementId: string;
  createdById: string;
  scannerName: string;
  target: string;
  input: Record<string, unknown>;
  aiRunId?: string;
  aiRunNodeId?: string;
  name?: string;
}

/** Outcome of a single dispatch. A failure is reported, never thrown. */
export interface DispatchResult {
  scanId: string;
  scanJobId: string;
  status: DispatchStatus;
  errorMessage?: string;
}

export interface ScanDispatcherOptions {
  /** Override the fallback poll interval. Defaults to 30 s (SP3); tests inject a small value. */
  pollIntervalMs?: number;
}

/**
 * Purpose-built dispatcher for the AI orchestrator loop. Replicates the proven
 * completion mechanics of the template orchestrator's `StepExecutor`
 * (subscribe-before-create, atomic Scan+ScanJob transaction, enqueue-after-commit,
 * poll+push wait, per-item timeout budget, single shared Redis `message`
 * listener with a per-channel handler map, `OnModuleDestroy` quit).
 *
 * The ONE behavioral difference: every dispatch RESOLVES a {@link DispatchResult}
 * for its terminal outcome instead of rejecting. A failure never throws and
 * never aborts sibling dispatches — {@link dispatchMany} runs items with
 * `Promise.all` where each settles independently, so a partial batch failure is
 * surfaced per item rather than collapsing the whole batch.
 *
 * **Completion strategy**: subscribe to `scanjob:done:<scanJobId>` AND poll
 * `prisma.scanJob.findUnique` every `pollIntervalMs`. Whichever fires first
 * wins. Since SP3 scan-worker publishes the channel on every terminal outcome,
 * so the push is the primary path and the poll is a 30 s lost-message fallback.
 */
@Injectable()
export class ScanDispatcher implements OnModuleDestroy {
  private readonly logger = new Logger(ScanDispatcher.name);
  private readonly pollIntervalMs: number;
  // Single shared `message` listener + per-channel dispatch map, so a wide
  // fan-out never trips Node's default 10-listener cap.
  private readonly channelHandlers = new Map<string, () => void>();
  private listenerBound = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ScannerRegistry,
    @Inject(JOB_BUS) private readonly bus: JobBus,
    @Inject(SCAN_DISPATCH_REDIS_SUBSCRIBER)
    private readonly subscriber: ScanDispatchRedisSubscriber,
    @Optional() options?: ScanDispatcherOptions,
  ) {
    this.pollIntervalMs = options?.pollIntervalMs ?? DEFAULT_FALLBACK_POLL_MS;
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.subscriber.quit();
    } catch (err) {
      // SIGTERM path — best-effort.
      this.logger.warn(`Redis subscriber quit() failed: ${(err as Error).message}`);
    }
  }

  private bindListenerOnce(): void {
    if (this.listenerBound) return;
    this.listenerBound = true;
    this.subscriber.on('message', (channel: string) => {
      // No payload parsing — the push is just a wake-up; `checkOnce` always
      // re-reads the authoritative status from Postgres.
      this.channelHandlers.get(channel)?.();
    });
  }

  /**
   * Dispatch every item and wait for each to reach a terminal status. Items
   * run concurrently and settle independently: one failure never aborts the
   * others. Results are returned in input order.
   */
  async dispatchMany(
    items: DispatchItem[],
    opts?: ScanDispatcherOptions,
  ): Promise<DispatchResult[]> {
    const pollIntervalMs = opts?.pollIntervalMs ?? this.pollIntervalMs;
    return Promise.all(items.map((item) => this.dispatchOne(item, pollIntervalMs)));
  }

  /**
   * End-to-end dispatch of a single item: subscribe -> create rows in tx ->
   * enqueue -> wait. Always resolves a {@link DispatchResult}; never rejects.
   */
  private async dispatchOne(item: DispatchItem, pollIntervalMs: number): Promise<DispatchResult> {
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
    // Register the per-channel handler BEFORE subscribe so any publisher
    // emitting between subscribe and row-creation is dispatched correctly.
    this.channelHandlers.set(channel, () => {
      void this.checkOnce(scanJobId, finishOk, finishErr);
    });

    // SUBSCRIBE FIRST — failure is non-fatal: polling is load-bearing.
    try {
      await this.subscriber.subscribe(channel);
    } catch (err) {
      this.logger.warn(
        `Redis subscribe(${channel}) failed: ${(err as Error).message} — relying on polling`,
      );
    }

    // Create Scan + ScanJob rows in a SINGLE transaction so a failure on the
    // ScanJob insert rolls back the Scan row instead of orphaning it.
    let scanId: string;
    try {
      scanId = await this.prisma.$transaction(async (tx) => {
        const scan = await tx.scan.create({
          data: {
            engagementId: item.engagementId,
            createdById: item.createdById,
            aiRunId: item.aiRunId ?? null,
            aiRunNodeId: item.aiRunNodeId ?? null,
            name: item.name ?? `${item.scannerName}-ai`,
          },
        });
        await tx.scanJob.create({
          data: {
            id: scanJobId,
            scanId: scan.id,
            scannerName: item.scannerName,
            target: item.target,
            input: item.input as Prisma.InputJsonValue,
            queuedAt: new Date(),
          },
        });
        return scan.id;
      });
    } catch (err) {
      // Row creation failed — tear down the subscription we opened above.
      // Nothing to wait for; report FAILED with an empty scanId.
      const message = err instanceof Error ? err.message : String(err);
      this.channelHandlers.delete(channel);
      await this.safeUnsubscribe(channel);
      return { scanId: '', scanJobId, status: 'FAILED', errorMessage: message };
    }

    // Enqueue on the BullMQ queue *after* the row exists so the scan-worker
    // never picks up a job whose row isn't visible.
    const payload: ScanJobPayload = {
      scanJobId,
      scannerName: item.scannerName,
      target: item.target,
      input: item.input,
      engagementId: item.engagementId,
    };
    try {
      await this.bus.publish<ScanJobPayload>(SCANNER_TOPIC, scanJobId, payload);
    } catch (err) {
      // DB rows are already committed; if the enqueue fails we reconcile both
      // rows to FAILED (best-effort) so the operator doesn't see a phantom
      // QUEUED scan that no worker will ever pick up.
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to enqueue scanJob=${scanJobId} scanner=${item.scannerName}: ${message}`,
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
      return { scanId, scanJobId, status: 'FAILED', errorMessage: `enqueue failed: ${message}` };
    }

    const budgetMs =
      this.registry.get(item.scannerName).docker.defaultTimeoutMs + DISPATCH_TIMEOUT_GRACE_MS;
    return this.awaitCompletion({
      scanId,
      scanJobId,
      channel,
      budgetMs,
      pollIntervalMs,
      bindCallbacks: (ok, err) => {
        finishOk = ok;
        finishErr = err;
      },
    });
  }

  /**
   * Runs the polling + Redis-push wait for a single ScanJob whose subscribe +
   * row have already been created by {@link dispatchOne}. RESOLVES a
   * {@link DispatchResult} for every terminal outcome (never rejects).
   */
  private awaitCompletion(args: {
    scanId: string;
    scanJobId: string;
    channel: string;
    budgetMs: number;
    pollIntervalMs: number;
    bindCallbacks: (ok: () => void, err: (err: Error) => void) => void;
  }): Promise<DispatchResult> {
    const { scanId, scanJobId, channel, budgetMs, pollIntervalMs, bindCallbacks } = args;

    return new Promise<DispatchResult>((resolve) => {
      let settled = false;
      let pollTimer: ReturnType<typeof setInterval> | null = null;
      let budgetTimer: ReturnType<typeof setTimeout> | null = null;

      const cleanup = (): void => {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = null;
        if (budgetTimer) clearTimeout(budgetTimer);
        budgetTimer = null;
        this.channelHandlers.delete(channel);
        void this.safeUnsubscribe(channel);
      };

      const settle = (result: Omit<DispatchResult, 'scanId' | 'scanJobId'>): void => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve({ scanId, scanJobId, ...result });
      };

      // `checkOnce` drives these two callbacks to a terminal DispatchResult.
      const finishOk = (): void => settle({ status: 'COMPLETED' });
      const finishErr = (err: Error): void => {
        if (err instanceof DispatchTerminalError) {
          settle({ status: err.status, errorMessage: err.errorMessage });
          return;
        }
        // Defensive: unexpected error type — treat as FAILED.
        settle({ status: 'FAILED', errorMessage: err.message });
      };

      // Hand callbacks back to dispatchOne so the shared message dispatcher
      // can drive completion via the channelHandlers map.
      bindCallbacks(finishOk, finishErr);

      pollTimer = setInterval(() => {
        void this.checkOnce(scanJobId, finishOk, finishErr);
      }, pollIntervalMs);

      budgetTimer = setTimeout(() => {
        settle({ status: 'TIMEOUT', errorMessage: 'dispatch budget exceeded' });
      }, budgetMs);
    });
  }

  private async safeUnsubscribe(channel: string): Promise<void> {
    try {
      await this.subscriber.unsubscribe(channel);
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
    finishErr(
      new DispatchTerminalError(row.status as DispatchStatus, row.errorMessage ?? undefined),
    );
  }
}

/** Internal carrier for a non-COMPLETED terminal status from `checkOnce`. */
class DispatchTerminalError extends Error {
  constructor(
    public readonly status: DispatchStatus,
    public readonly errorMessage?: string,
  ) {
    super(`ScanJob finished with status=${status}`);
    this.name = 'DispatchTerminalError';
  }
}
