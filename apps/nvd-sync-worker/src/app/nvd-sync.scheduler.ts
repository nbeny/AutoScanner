import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { CronExpressionParser } from 'cron-parser';
import { JOB_BUS, type JobBus } from '@autoscanner/messaging';
import type { NvdSyncPayload } from '@autoscanner/queues';

const DAILY_2AM = '0 2 * * *'; // incremental sync every day at 02:00
const WEEKLY_SUN_3AM = '0 3 * * 0'; // full re-sync weekly, Sunday 03:00
const NVD_SYNC_TOPIC = 'security.nvd.sync.requested';
const TICK_MS = 60_000;

/**
 * Publishes NVD sync jobs on a cron schedule. Replaces the former BullMQ `repeat` jobs.
 * Next-fire times are recomputed from `now` at boot, so a restart never double-fires; a run
 * missed while the worker was down is skipped (the processor's windowed/idempotent sync means
 * no data is lost — the next run widens its window).
 */
@Injectable()
export class NvdSyncScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(NvdSyncScheduler.name);
  private timer?: NodeJS.Timeout;
  private nextIncremental = 0;
  private nextFull = 0;

  constructor(@Inject(JOB_BUS) private readonly bus: JobBus) {}

  onApplicationBootstrap(): void {
    this.nextIncremental = CronExpressionParser.parse(DAILY_2AM).next().toDate().getTime();
    this.nextFull = CronExpressionParser.parse(WEEKLY_SUN_3AM).next().toDate().getTime();
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.logger.log(
      'NVD sync cron scheduler started (incremental daily 02:00, full weekly Sun 03:00)',
    );
  }

  private async tick(): Promise<void> {
    const now = Date.now();
    if (now >= this.nextIncremental) {
      await this.publish('incremental');
      this.nextIncremental = CronExpressionParser.parse(DAILY_2AM).next().toDate().getTime();
    }
    if (now >= this.nextFull) {
      await this.publish('full');
      this.nextFull = CronExpressionParser.parse(WEEKLY_SUN_3AM).next().toDate().getTime();
    }
  }

  private async publish(mode: NvdSyncPayload['mode']): Promise<void> {
    try {
      await this.bus.publish<NvdSyncPayload>(NVD_SYNC_TOPIC, mode, { mode });
      this.logger.log(`enqueued NVD ${mode} sync`);
    } catch (err) {
      this.logger.error(`failed to enqueue NVD ${mode} sync: ${(err as Error).message}`);
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
