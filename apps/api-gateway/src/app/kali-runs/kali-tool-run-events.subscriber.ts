import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Redis } from 'ioredis';

/**
 * DI token for the ioredis client the {@link KaliToolRunEventsSubscriber} listens on.
 * A dedicated subscriber connection (ioredis switches a connection into
 * subscriber mode on `subscribe`, so it can't be shared with query clients).
 */
export const KALI_TOOL_RUN_EVENTS_SUBSCRIBER = Symbol('KALI_TOOL_RUN_EVENTS_SUBSCRIBER');

/** The Redis channel a Kali tool run's live events are published to. */
export function kaliToolRunEventsChannel(runId: string): string {
  return `kalitool:events:${runId}`;
}

/**
 * A single event as it arrives on the channel. The worker publishes a
 * discriminated shape keyed on `type`; the rest of the fields are variant
 * dependent, so they're kept opaque here and narrowed by the resolver.
 */
export interface KaliToolRunEventMessage {
  type: string;
  [k: string]: unknown;
}

interface IteratorState {
  queue: KaliToolRunEventMessage[];
  waiter: ((v: IteratorResult<KaliToolRunEventMessage>) => void) | null;
  done: boolean;
}

/**
 * Streams Kali tool run progress events from Redis pub/sub to the `kaliToolRunEvents` GraphQL
 * subscription. Ported from {@link RedisLogStreamSubscriber}: a per-channel Set
 * of iterator states (queue + waiter machine), a single bound `message`
 * listener, and refcounted subscribe/unsubscribe.
 */
@Injectable()
export class KaliToolRunEventsSubscriber implements OnModuleDestroy {
  private readonly logger = new Logger(KaliToolRunEventsSubscriber.name);
  private readonly subscribersByChannel = new Map<string, Set<IteratorState>>();
  private listenerBound = false;

  constructor(@Inject(KALI_TOOL_RUN_EVENTS_SUBSCRIBER) private readonly redis: Redis) {}

  subscribe(runId: string): AsyncIterable<KaliToolRunEventMessage> {
    this.bindListener();
    const ch = kaliToolRunEventsChannel(runId);
    const state: IteratorState = { queue: [], waiter: null, done: false };
    const set = this.getOrCreateSet(ch);
    set.add(state);
    if (set.size === 1) {
      void this.redis.subscribe(ch).catch((err) => {
        this.logger.error(`Failed to subscribe ${runId}: ${(err as Error).message}`);
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
      let parsed: KaliToolRunEventMessage;
      try {
        parsed = JSON.parse(msg) as KaliToolRunEventMessage;
      } catch {
        this.logger.warn(`malformed Kali tool run event on ${ch}`);
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

  private makeIterable(ch: string, state: IteratorState): AsyncIterable<KaliToolRunEventMessage> {
    const self = this;
    return {
      [Symbol.asyncIterator](): AsyncIterator<KaliToolRunEventMessage> {
        return {
          next(): Promise<IteratorResult<KaliToolRunEventMessage>> {
            if (state.queue.length > 0) {
              return Promise.resolve({
                value: state.queue.shift() as KaliToolRunEventMessage,
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
          async return(): Promise<IteratorResult<KaliToolRunEventMessage>> {
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
