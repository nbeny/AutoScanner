import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Redis } from 'ioredis';

import {
  channelName,
  LogChunk,
  LogStreamPublisher,
  LogStreamSubscriber,
  REDIS_PUBLISHER_CLIENT,
  REDIS_SUBSCRIBER_CLIENT,
} from './tokens';

export { channelName };

@Injectable()
export class RedisLogStreamPublisher implements LogStreamPublisher {
  constructor(@Inject(REDIS_PUBLISHER_CLIENT) private readonly redis: Redis) {}

  async publish(chunk: LogChunk): Promise<void> {
    await this.redis.publish(channelName(chunk.scanJobId), JSON.stringify(chunk));
  }
}

interface IteratorState {
  queue: LogChunk[];
  waiter: ((v: IteratorResult<LogChunk>) => void) | null;
  done: boolean;
}

@Injectable()
export class RedisLogStreamSubscriber implements LogStreamSubscriber, OnModuleDestroy {
  private readonly logger = new Logger(RedisLogStreamSubscriber.name);
  private readonly subscribersByChannel = new Map<string, Set<IteratorState>>();
  private listenerBound = false;

  constructor(@Inject(REDIS_SUBSCRIBER_CLIENT) private readonly redis: Redis) {}

  subscribe(scanJobId: string): AsyncIterable<LogChunk> {
    this.bindListener();
    const ch = channelName(scanJobId);
    const state: IteratorState = { queue: [], waiter: null, done: false };
    const set = this.getOrCreateSet(ch);
    set.add(state);
    if (set.size === 1) {
      void this.redis.subscribe(ch).catch((err) => {
        this.logger.error(`Failed to subscribe ${scanJobId}: ${(err as Error).message}`);
      });
    }
    return this.makeIterable(ch, state);
  }

  async close(): Promise<void> {
    for (const [ch, set] of this.subscribersByChannel.entries()) {
      for (const state of set) {
        state.done = true;
        state.waiter?.({ value: undefined as never, done: true });
        state.waiter = null;
      }
      try {
        await this.redis.unsubscribe(ch);
      } catch (err) {
        this.logger.warn(`unsubscribe ${ch}: ${(err as Error).message}`);
      }
    }
    this.subscribersByChannel.clear();
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
    try {
      await this.redis.quit();
    } catch {
      /* ignore */
    }
  }

  private bindListener(): void {
    if (this.listenerBound) return;
    this.listenerBound = true;
    this.redis.on('message', (ch: string, msg: string) => {
      const set = this.subscribersByChannel.get(ch);
      if (!set || set.size === 0) return;
      let parsed: LogChunk;
      try {
        parsed = JSON.parse(msg) as LogChunk;
      } catch {
        this.logger.warn(`malformed log message on ${ch}`);
        return;
      }
      for (const state of set) {
        if (state.waiter) {
          const w = state.waiter;
          state.waiter = null;
          w({ value: parsed, done: false });
        } else {
          state.queue.push(parsed);
        }
      }
    });
  }

  private getOrCreateSet(ch: string): Set<IteratorState> {
    let set = this.subscribersByChannel.get(ch);
    if (!set) {
      set = new Set();
      this.subscribersByChannel.set(ch, set);
    }
    return set;
  }

  private makeIterable(ch: string, state: IteratorState): AsyncIterable<LogChunk> {
    const self = this;
    return {
      [Symbol.asyncIterator](): AsyncIterator<LogChunk> {
        return {
          next(): Promise<IteratorResult<LogChunk>> {
            if (state.queue.length > 0) {
              return Promise.resolve({ value: state.queue.shift() as LogChunk, done: false });
            }
            if (state.done) {
              return Promise.resolve({ value: undefined as never, done: true });
            }
            return new Promise((resolve) => {
              state.waiter = resolve;
            });
          },
          async return(): Promise<IteratorResult<LogChunk>> {
            state.done = true;
            state.waiter?.({ value: undefined as never, done: true });
            state.waiter = null;
            const set = self.subscribersByChannel.get(ch);
            if (set) {
              set.delete(state);
              if (set.size === 0) {
                self.subscribersByChannel.delete(ch);
                try {
                  await self.redis.unsubscribe(ch);
                } catch {
                  /* ignore */
                }
              }
            }
            return { value: undefined as never, done: true };
          },
        };
      },
    };
  }
}
