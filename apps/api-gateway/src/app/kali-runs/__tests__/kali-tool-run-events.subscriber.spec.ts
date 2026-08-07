import { EventEmitter } from 'node:events';

import {
  KaliToolRunEventsSubscriber,
  kaliToolRunEventsChannel,
  type KaliToolRunEventMessage,
} from '../kali-tool-run-events.subscriber';

/**
 * Fake ioredis subscriber: an EventEmitter (for the `message` event the
 * subscriber binds to) with jest-mocked pub/sub control methods. Inject a
 * message with `.emit('message', channel, payload)`.
 */
class FakeRedis extends EventEmitter {
  subscribe = jest.fn(async (_channel: string) => 1);
  unsubscribe = jest.fn(async (_channel: string) => 0);
  quit = jest.fn(async () => 'OK' as const);
}

async function collect<T>(iter: AsyncIterable<T>, n: number): Promise<T[]> {
  const out: T[] = [];
  for await (const v of iter) {
    out.push(v);
    if (out.length >= n) break;
  }
  return out;
}

describe('kaliToolRunEventsChannel', () => {
  it('produces a stable, scoped channel name', () => {
    expect(kaliToolRunEventsChannel('r1')).toBe('kalitool:events:r1');
  });
});

describe('KaliToolRunEventsSubscriber', () => {
  it('yields a parsed event after a message is emitted on the run channel', async () => {
    const redis = new FakeRedis();
    const subscriber = new KaliToolRunEventsSubscriber(redis as never);

    const iter = subscriber.subscribe('r1');
    // let the async subscribe() register on the channel
    await new Promise((r) => setImmediate(r));
    expect(redis.subscribe).toHaveBeenCalledWith('kalitool:events:r1');

    redis.emit(
      'message',
      'kalitool:events:r1',
      JSON.stringify({ type: 'status', status: 'RUNNING' }),
    );

    const [event] = await collect(iter, 1);
    expect(event).toEqual<KaliToolRunEventMessage>({ type: 'status', status: 'RUNNING' });

    await subscriber.close();
  });

  it('delivers two queued messages in order', async () => {
    const redis = new FakeRedis();
    const subscriber = new KaliToolRunEventsSubscriber(redis as never);

    const iter = subscriber.subscribe('r2');
    await new Promise((r) => setImmediate(r));

    redis.emit(
      'message',
      'kalitool:events:r2',
      JSON.stringify({ type: 'progress', depth: 1, round: 1 }),
    );
    redis.emit(
      'message',
      'kalitool:events:r2',
      JSON.stringify({ type: 'progress', depth: 2, round: 1 }),
    );

    const events = await collect(iter, 2);
    expect(events.map((e) => e.depth)).toEqual([1, 2]);

    await subscriber.close();
  });

  it('does not throw and does not yield on malformed JSON', async () => {
    const redis = new FakeRedis();
    const subscriber = new KaliToolRunEventsSubscriber(redis as never);

    const iter = subscriber.subscribe('r3');
    await new Promise((r) => setImmediate(r));

    // malformed payload must be swallowed (stream stays alive)
    expect(() => redis.emit('message', 'kalitool:events:r3', '{not json')).not.toThrow();
    // a valid message after the bad one is still delivered
    redis.emit('message', 'kalitool:events:r3', JSON.stringify({ type: 'audit-ready' }));

    const [event] = await collect(iter, 1);
    expect(event).toEqual({ type: 'audit-ready' });

    await subscriber.close();
  });

  it('unsubscribes when the last consumer leaves via return()', async () => {
    const redis = new FakeRedis();
    const subscriber = new KaliToolRunEventsSubscriber(redis as never);

    const iter = subscriber.subscribe('r4');
    await new Promise((r) => setImmediate(r));

    const it = iter[Symbol.asyncIterator]();
    await it.return?.();

    expect(redis.unsubscribe).toHaveBeenCalledWith('kalitool:events:r4');

    await subscriber.close();
  });
});
