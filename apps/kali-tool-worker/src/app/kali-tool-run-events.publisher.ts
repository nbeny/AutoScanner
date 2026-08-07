import { Inject, Injectable, Logger } from '@nestjs/common';
import type IORedis from 'ioredis';

/**
 * DI token for the ioredis client the {@link KaliToolRunEventsPublisher} publishes on.
 * A plain publishing client (not a subscriber) — provided in `app.module`.
 */
export const KALI_TOOL_RUN_EVENTS_REDIS = Symbol('KALI_TOOL_RUN_EVENTS_REDIS');

/** The Redis channel a Kali tool run's live events are published to. */
export function kaliToolRunEventsChannel(runId: string): string {
  return `kalitool:events:${runId}`;
}

/**
 * Best-effort pub/sub publisher for Kali tool run progress events. The API-gateway GraphQL
 * subscription subscribes to `kalitool:events:<id>` to stream status/node/progress
 * updates to the operator. Publishing never throws — a failed publish is logged
 * and swallowed so it can never break the run loop.
 */
@Injectable()
export class KaliToolRunEventsPublisher {
  private readonly logger = new Logger(KaliToolRunEventsPublisher.name);

  constructor(@Inject(KALI_TOOL_RUN_EVENTS_REDIS) private readonly redis: IORedis) {}

  async publish(runId: string, event: { type: string; [k: string]: unknown }): Promise<void> {
    try {
      await this.redis.publish(kaliToolRunEventsChannel(runId), JSON.stringify(event));
    } catch (err) {
      this.logger.warn(
        `failed to publish Kali tool run event for ${runId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
