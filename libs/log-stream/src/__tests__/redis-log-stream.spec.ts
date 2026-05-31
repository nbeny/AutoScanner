import { EventEmitter } from 'node:events';

import {
  channelName,
  MAX_LOG_CHUNK_BYTES,
  RedisLogStreamPublisher,
  RedisLogStreamSubscriber,
} from '../redis-log-stream';
import type { LogChunk } from '../types';

/**
 * Minimal IORedis stand-in. Two instances act as publisher & subscriber clients,
 * routed through a shared EventEmitter to emulate Redis pub/sub.
 */
class FakeRedis extends EventEmitter {
  private readonly subs = new Set<string>();

  constructor(private readonly bus: EventEmitter) {
    super();
    this.bus.on('publish', (ch: string, msg: string) => {
      if (this.subs.has(ch)) this.emit('message', ch, msg);
    });
  }

  async publish(channel: string, msg: string): Promise<number> {
    this.bus.emit('publish', channel, msg);
    return 1;
  }

  async subscribe(channel: string): Promise<number> {
    this.subs.add(channel);
    return this.subs.size;
  }

  async unsubscribe(channel: string): Promise<number> {
    this.subs.delete(channel);
    return this.subs.size;
  }

  async quit(): Promise<'OK'> {
    return 'OK';
  }
}

function makePair() {
  const bus = new EventEmitter();
  return { pub: new FakeRedis(bus), sub: new FakeRedis(bus) };
}

async function collect<T>(iter: AsyncIterable<T>, n: number): Promise<T[]> {
  const out: T[] = [];
  for await (const v of iter) {
    out.push(v);
    if (out.length >= n) break;
  }
  return out;
}

describe('channelName', () => {
  it('produces a stable, scoped channel name', () => {
    expect(channelName('job_abc')).toBe('scanjob:logs:job_abc');
  });
});

describe('RedisLogStream end-to-end via fake redis', () => {
  it('delivers published chunks to active subscribers in order', async () => {
    const { pub, sub } = makePair();
    const publisher = new RedisLogStreamPublisher(pub as never);
    const subscriber = new RedisLogStreamSubscriber(sub as never);

    const iter = subscriber.subscribe('job_1');
    // give the subscribe call time to register on the bus
    await new Promise((r) => setImmediate(r));

    const t0 = Date.now();
    await publisher.publish({ scanJobId: 'job_1', stream: 'stdout', ts: t0, chunk: 'a' });
    await publisher.publish({ scanJobId: 'job_1', stream: 'stderr', ts: t0 + 1, chunk: 'b' });

    const chunks = await collect(iter, 2);
    expect(chunks).toEqual<LogChunk[]>([
      { scanJobId: 'job_1', stream: 'stdout', ts: t0, chunk: 'a' },
      { scanJobId: 'job_1', stream: 'stderr', ts: t0 + 1, chunk: 'b' },
    ]);

    await subscriber.close();
  });

  it('does NOT deliver chunks from other scanJobs', async () => {
    const { pub, sub } = makePair();
    const publisher = new RedisLogStreamPublisher(pub as never);
    const subscriber = new RedisLogStreamSubscriber(sub as never);

    const iter = subscriber.subscribe('job_a');
    await new Promise((r) => setImmediate(r));

    await publisher.publish({ scanJobId: 'job_b', stream: 'stdout', ts: 1, chunk: 'ignore' });
    await publisher.publish({ scanJobId: 'job_a', stream: 'stdout', ts: 2, chunk: 'keep' });

    const chunks = await collect(iter, 1);
    expect(chunks).toEqual([{ scanJobId: 'job_a', stream: 'stdout', ts: 2, chunk: 'keep' }]);

    await subscriber.close();
  });

  it('multiple subscribers on the same scanJob each get every chunk', async () => {
    const { pub, sub } = makePair();
    const publisher = new RedisLogStreamPublisher(pub as never);
    const subscriber = new RedisLogStreamSubscriber(sub as never);

    const a = subscriber.subscribe('job_x');
    const b = subscriber.subscribe('job_x');
    await new Promise((r) => setImmediate(r));

    await publisher.publish({ scanJobId: 'job_x', stream: 'stdout', ts: 1, chunk: 'one' });
    await publisher.publish({ scanJobId: 'job_x', stream: 'stdout', ts: 2, chunk: 'two' });

    const [aOut, bOut] = await Promise.all([collect(a, 2), collect(b, 2)]);
    expect(aOut.map((c) => c.chunk)).toEqual(['one', 'two']);
    expect(bOut.map((c) => c.chunk)).toEqual(['one', 'two']);

    await subscriber.close();
  });

  it('truncates oversized chunks before publishing (stays under Redis pubsub limit)', async () => {
    // A single multi-MiB scanner line would exceed Redis pubsub's default
    // client-output-buffer-limit and kick every subscriber on the connection.
    // The publisher must shrink the chunk before hitting redis.publish.
    const { pub, sub } = makePair();
    const publisher = new RedisLogStreamPublisher(pub as never);
    const subscriber = new RedisLogStreamSubscriber(sub as never);

    const iter = subscriber.subscribe('job_big');
    await new Promise((r) => setImmediate(r));

    const oversized = 'x'.repeat(MAX_LOG_CHUNK_BYTES * 2);
    await publisher.publish({ scanJobId: 'job_big', stream: 'stdout', ts: 1, chunk: oversized });

    const [delivered] = await collect(iter, 1);
    expect(Buffer.byteLength(delivered.chunk, 'utf8')).toBeLessThanOrEqual(MAX_LOG_CHUNK_BYTES);
    expect(delivered.chunk).toMatch(/truncated, original \d+ bytes/);
    // Tail-preserving: the last bytes of the original input survive.
    expect(delivered.chunk.startsWith('xxxx')).toBe(true);

    await subscriber.close();
  });

  it('passes chunks under the cap through unchanged', async () => {
    // Regression guard: don't pay the truncation cost on the common path.
    const { pub, sub } = makePair();
    const publisher = new RedisLogStreamPublisher(pub as never);
    const subscriber = new RedisLogStreamSubscriber(sub as never);

    const iter = subscriber.subscribe('job_small');
    await new Promise((r) => setImmediate(r));

    const payload = 'hello world\n';
    await publisher.publish({ scanJobId: 'job_small', stream: 'stdout', ts: 1, chunk: payload });

    const [delivered] = await collect(iter, 1);
    expect(delivered.chunk).toBe(payload);

    await subscriber.close();
  });

  it('terminates the iterator with done:true when redis subscribe rejects (no hang)', async () => {
    // Without this guarantee, the GraphQL `scanJobLogs` subscription would
    // hang forever because the iterator's `next()` parks on a Promise that
    // nothing ever resolves — no subscription means no `message` event.
    const { sub } = makePair();
    (sub as unknown as { subscribe: (ch: string) => Promise<number> }).subscribe = () =>
      Promise.reject(new Error('redis down'));

    const subscriber = new RedisLogStreamSubscriber(sub as never);
    const iter = subscriber.subscribe('job_fail');

    // Race: if the iterator never resolves, this rejects after the timeout.
    const next = (async () => {
      for await (const _ of iter) {
        return 'yielded';
      }
      return 'closed';
    })();
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('iterator hung')), 500),
    );

    await expect(Promise.race([next, timeout])).resolves.toBe('closed');
  });
});
