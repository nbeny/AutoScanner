import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import {
  decodeEngagementEvent,
  engagementChannel,
  type EngagementUpdateEvent,
} from '@autoscanner/engagement-events';

export interface IORedisSubscribeLike {
  subscribe(channel: string): Promise<unknown>;
  unsubscribe(channel: string): Promise<unknown>;
  on(event: 'message', listener: (channel: string, message: string) => void): void;
  quit(): Promise<unknown>;
}

export const ENGAGEMENT_EVENTS_SUBSCRIBE_CLIENT = Symbol('ENGAGEMENT_EVENTS_SUBSCRIBE_CLIENT');

type Pump = (event: EngagementUpdateEvent) => void;

@Injectable()
export class EngagementEventsSubscriberService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EngagementEventsSubscriberService.name);
  private readonly handlers = new Map<string, Set<Pump>>();
  private listenerBound = false;

  constructor(
    @Inject(ENGAGEMENT_EVENTS_SUBSCRIBE_CLIENT)
    private readonly redis: IORedisSubscribeLike,
  ) {}

  onModuleInit(): void {
    if (this.listenerBound) return;
    this.listenerBound = true;
    this.redis.on('message', (channel: string, message: string) => {
      const pumps = this.handlers.get(channel);
      if (!pumps || pumps.size === 0) return;
      let event: EngagementUpdateEvent;
      try {
        event = decodeEngagementEvent(message);
      } catch (err) {
        this.logger.warn(`Dropping malformed payload on ${channel}: ${(err as Error).message}`);
        return;
      }
      for (const pump of pumps) {
        try {
          pump(event);
        } catch (err) {
          this.logger.warn(`Pump error: ${(err as Error).message}`);
        }
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.redis.quit();
    } catch {
      // ignore
    }
  }

  subscribe(engagementId: string): AsyncIterable<EngagementUpdateEvent> {
    const channel = engagementChannel(engagementId);
    const queue: EngagementUpdateEvent[] = [];
    let resolver: ((value: IteratorResult<EngagementUpdateEvent>) => void) | null = null;
    let closed = false;

    const pump: Pump = (event) => {
      if (closed) return;
      if (resolver) {
        const r = resolver;
        resolver = null;
        r({ value: event, done: false });
      } else {
        queue.push(event);
      }
    };

    let pumps = this.handlers.get(channel);
    if (!pumps) {
      pumps = new Set();
      this.handlers.set(channel, pumps);
      void this.redis.subscribe(channel).catch((err: Error) => {
        this.logger.warn(`Redis subscribe failed for ${channel}: ${err.message}`);
      });
    }
    pumps.add(pump);

    const cleanup = async (): Promise<void> => {
      if (closed) return;
      closed = true;
      const set = this.handlers.get(channel);
      if (set) {
        set.delete(pump);
        if (set.size === 0) {
          this.handlers.delete(channel);
          try {
            await this.redis.unsubscribe(channel);
          } catch (err) {
            this.logger.warn(`Redis unsubscribe failed for ${channel}: ${(err as Error).message}`);
          }
        }
      }
      if (resolver) {
        const r = resolver;
        resolver = null;
        r({ value: undefined as unknown as EngagementUpdateEvent, done: true });
      }
    };

    const iterator: AsyncIterator<EngagementUpdateEvent> = {
      next: () => {
        if (closed) {
          return Promise.resolve({
            value: undefined as unknown as EngagementUpdateEvent,
            done: true,
          });
        }
        const queued = queue.shift();
        if (queued) {
          return Promise.resolve({ value: queued, done: false });
        }
        return new Promise((res) => {
          resolver = res;
        });
      },
      return: async () => {
        await cleanup();
        return {
          value: undefined as unknown as EngagementUpdateEvent,
          done: true,
        };
      },
      throw: async (err) => {
        await cleanup();
        throw err;
      },
    };

    return {
      [Symbol.asyncIterator]: () => iterator,
    };
  }
}
