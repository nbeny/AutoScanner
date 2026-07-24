import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Redis } from 'ioredis';

/**
 * DI token for the ioredis client the {@link AiRunEventsSubscriber} listens on.
 * A dedicated subscriber connection (ioredis switches a connection into
 * subscriber mode on `subscribe`, so it can't be shared with query clients).
 */
export const AI_RUN_EVENTS_REDIS_SUBSCRIBER = Symbol('AI_RUN_EVENTS_REDIS_SUBSCRIBER');

/** The Redis channel an AI run's live events are published to. */
export function aiRunEventsChannel(aiRunId: string): string {
  return `airun:events:${aiRunId}`;
}

/**
 * A single event as it arrives on the channel. The worker publishes a
 * discriminated shape keyed on `type`; the rest of the fields are variant
 * dependent, so they're kept opaque here and narrowed by the resolver.
 */
export interface AiRunEventMessage {
  type: string;
  [k: string]: unknown;
}

interface IteratorState {
  queue: AiRunEventMessage[];
  waiter: ((v: IteratorResult<AiRunEventMessage>) => void) | null;
  done: boolean;
}

/**
 * Streams AI-run progress events from Redis pub/sub to the `aiRunEvents` GraphQL
 * subscription. Ported from {@link RedisLogStreamSubscriber}: a per-channel Set
 * of iterator states (queue + waiter machine), a single bound `message`
 * listener, and refcounted subscribe/unsubscribe.
 */
@Injectable()
export class AiRunEventsSubscriber implements OnModuleDestroy {
  private readonly logger = new Logger(AiRunEventsSubscriber.name);
  private readonly subscribersByChannel = new Map<string, Set<IteratorState>>();
  private listenerBound = false;

  constructor(@Inject(AI_RUN_EVENTS_REDIS_SUBSCRIBER) private readonly redis: Redis) {}

  subscribe(aiRunId: string): AsyncIterable<AiRunEventMessage> {
    this.bindListener();
    const ch = aiRunEventsChannel(aiRunId);
    const state: IteratorState = { queue: [], waiter: null, done: false };
    const set = this.getOrCreateSet(ch);
    set.add(state);
    if (set.size === 1) {
      void this.redis.subscribe(ch).catch((err) => {
        this.logger.error(`Failed to subscribe ${aiRunId}: ${(err as Error).message}`);
        // Without this, the iterator below hangs forever: it waits in a Promise
        // for messages that will never arrive (no subscription = no `message`
        // event). Tear every state attached to this channel down so the iterator
        // yields `done: true` on its next read.
        this.terminateChannel(ch);
      });
    }
    return this.makeIterable(ch, state);
  }

  private terminateChannel(ch: string): void {
    const set = this.subscribersByChannel.get(ch);
    if (!set) return;
    for (const state of set) {
      state.done = true;
      const w = state.waiter;
      state.waiter = null;
      w?.({ value: undefined as never, done: true });
    }
    this.subscribersByChannel.delete(ch);
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
      let parsed: AiRunEventMessage;
      try {
        parsed = JSON.parse(msg) as AiRunEventMessage;
      } catch {
        this.logger.warn(`malformed AI-run event on ${ch}`);
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

  private makeIterable(ch: string, state: IteratorState): AsyncIterable<AiRunEventMessage> {
    const self = this;
    return {
      [Symbol.asyncIterator](): AsyncIterator<AiRunEventMessage> {
        return {
          next(): Promise<IteratorResult<AiRunEventMessage>> {
            if (state.queue.length > 0) {
              return Promise.resolve({
                value: state.queue.shift() as AiRunEventMessage,
                done: false,
              });
            }
            if (state.done) {
              return Promise.resolve({ value: undefined as never, done: true });
            }
            return new Promise((resolve) => {
              state.waiter = resolve;
            });
          },
          async return(): Promise<IteratorResult<AiRunEventMessage>> {
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
