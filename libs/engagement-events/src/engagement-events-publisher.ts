import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

import { encodeEngagementEvent, engagementChannel, type EngagementUpdateEvent } from './types';

export const ENGAGEMENT_EVENTS_PUBLISHER = Symbol('ENGAGEMENT_EVENTS_PUBLISHER');

export interface EngagementEventsPublisher {
  publish(event: EngagementUpdateEvent): Promise<void>;
}

export interface IORedisPublishLike {
  publish(channel: string, message: string): Promise<number>;
  quit(): Promise<unknown>;
}

export const ENGAGEMENT_EVENTS_REDIS_CLIENT = Symbol('ENGAGEMENT_EVENTS_REDIS_CLIENT');

@Injectable()
export class IoredisEngagementEventsPublisher
  implements EngagementEventsPublisher, OnModuleDestroy
{
  private readonly logger = new Logger(IoredisEngagementEventsPublisher.name);

  constructor(
    @Inject(ENGAGEMENT_EVENTS_REDIS_CLIENT)
    private readonly redis: IORedisPublishLike,
  ) {}

  async publish(event: EngagementUpdateEvent): Promise<void> {
    const channel = engagementChannel(event.engagementId);
    try {
      await this.redis.publish(channel, encodeEngagementEvent(event));
    } catch (err) {
      this.logger.warn(
        `Failed to publish ${event.kind} for ${event.engagementId}: ${(err as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.redis.quit();
    } catch {
      // ignore — already closed
    }
  }
}
