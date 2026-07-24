import { Inject, Injectable, Logger } from '@nestjs/common';
import type IORedis from 'ioredis';

/**
 * DI token for the ioredis client the {@link AiRunEventsPublisher} publishes on.
 * A plain publishing client (not a subscriber) — provided in `app.module`.
 */
export const AI_RUN_EVENTS_REDIS = Symbol('AI_RUN_EVENTS_REDIS');

/** The Redis channel an AI run's live events are published to. */
export function aiRunEventsChannel(aiRunId: string): string {
  return `airun:events:${aiRunId}`;
}

/**
 * Best-effort pub/sub publisher for AI-run progress events. The Phase 4 GraphQL
 * subscription subscribes to `airun:events:<id>` to stream status/node/progress
 * updates to the operator. Publishing never throws — a failed publish is logged
 * and swallowed so it can never break the decision loop.
 */
@Injectable()
export class AiRunEventsPublisher {
  private readonly logger = new Logger(AiRunEventsPublisher.name);

  constructor(@Inject(AI_RUN_EVENTS_REDIS) private readonly redis: IORedis) {}

  async publish(aiRunId: string, event: { type: string; [k: string]: unknown }): Promise<void> {
    try {
      await this.redis.publish(aiRunEventsChannel(aiRunId), JSON.stringify(event));
    } catch (err) {
      this.logger.warn(
        `failed to publish AI-run event for ${aiRunId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
