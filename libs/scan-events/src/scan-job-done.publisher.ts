import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { SCAN_JOB_DONE_REDIS_CLIENT } from './tokens';
import { scanJobDoneChannel } from './channel';

/**
 * Publishes a ScanJob completion wake-up to `scanjob:done:<id>` (SP3).
 *
 * The payload carries the terminal status, but the waiters re-read Postgres (the single source
 * of truth); this is only a "wake up now" signal that replaces waiting up to one poll interval.
 * A failed publish is swallowed — the waiter's fallback poll still settles the wait, so a Redis
 * blip must never fail a ScanJob.
 */
@Injectable()
export class ScanJobDonePublisher {
  private readonly logger = new Logger(ScanJobDonePublisher.name);

  constructor(@Inject(SCAN_JOB_DONE_REDIS_CLIENT) private readonly redis: Pick<Redis, 'publish'>) {}

  async publishDone(scanJobId: string, status: string): Promise<void> {
    try {
      await this.redis.publish(
        scanJobDoneChannel(scanJobId),
        JSON.stringify({ scanJobId, status }),
      );
    } catch (err) {
      this.logger.warn(
        `scanjob:done publish failed for ${scanJobId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
