import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { QueueName, type NvdSyncPayload } from '@autoscanner/queues';

const DAILY_2AM = '0 2 * * *'; // incremental sync every day at 02:00
const WEEKLY_SUN_3AM = '0 3 * * 0'; // full re-sync weekly, Sunday 03:00

@Injectable()
export class NvdSyncScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(NvdSyncScheduler.name);

  constructor(@InjectQueue(QueueName.NVD_SYNC) private readonly queue: Queue<NvdSyncPayload>) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.add(
      'nvd-sync',
      { mode: 'incremental' },
      { repeat: { pattern: DAILY_2AM }, jobId: 'nvd-sync-incremental' },
    );
    await this.queue.add(
      'nvd-sync',
      { mode: 'full' },
      { repeat: { pattern: WEEKLY_SUN_3AM }, jobId: 'nvd-sync-full' },
    );
    this.logger.log(
      'registered NVD_SYNC repeatable jobs (incremental daily 02:00, full weekly Sun 03:00)',
    );
  }
}
