import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

import { PrismaService } from '@autoscanner/database';
import { FindingClient, RiskClient } from '@autoscanner/service-clients';

const DEFAULT_INTERVAL_MS = 300_000; // 5 min

function readIntervalMs(): number {
  const raw = process.env.CORRELATION_SWEEP_INTERVAL_MS;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_INTERVAL_MS;
}

/**
 * Periodic engagement-wide correlation sweep (SP2c).
 *
 * Since SP2c the per-parse-job path only correlates and recomputes the assets that job touched
 * — cheap, and complete for per-asset clustering. The one genuinely engagement-wide pass, the
 * cross-asset Finding dedup, plus a defensive full re-correlate/re-risk, run here on a timer so
 * their cost is decoupled from parse-job volume (defect 6: "engagement-wide sweeps become a
 * scheduled job").
 *
 * Each engagement is swept independently; a failure on one never stops the others, and the
 * whole sweep is best-effort (the DB is already consistent from the per-job passes — this is a
 * safety net, not a correctness dependency).
 */
@Injectable()
export class CorrelationSweepScheduler implements OnModuleDestroy {
  private readonly logger = new Logger(CorrelationSweepScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly findingClient: FindingClient,
    private readonly riskClient: RiskClient,
  ) {}

  start(intervalMs: number = readIntervalMs()): void {
    if (this.timer) return;
    void this.safeSweep();
    this.timer = setInterval(() => void this.safeSweep(), intervalMs);
    this.logger.log(`correlation sweep started (interval=${intervalMs}ms)`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async safeSweep(): Promise<void> {
    if (this.running) return; // skip overlapping ticks
    this.running = true;
    try {
      await this.sweepOnce();
    } catch (err) {
      this.logger.error(
        `correlation sweep tick failed: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }

  async sweepOnce(): Promise<void> {
    // v1 sweeps every live engagement. A `lastScanAt`/activity filter is a later optimization;
    // log the breadth so a silent full sweep isn't mistaken for a scoped one.
    const engagements = await this.prisma.engagement.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });
    if (engagements.length === 0) return;
    this.logger.log(`correlation sweep: ${engagements.length} engagement(s)`);

    for (const { id } of engagements) {
      try {
        await this.findingClient.dedup(id);
        await this.findingClient.correlate(id); // engagement-wide (no assetIds)

        const assetRows = await this.prisma.finding.findMany({
          where: { asset: { engagementId: id } },
          select: { assetId: true },
          distinct: ['assetId'],
        });
        const assetIds = assetRows.map((r) => r.assetId);
        if (assetIds.length > 0) {
          await this.riskClient.recomputeBatch(assetIds);
        }
      } catch (err) {
        this.logger.warn(
          `correlation sweep failed for engagement ${id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }
}
