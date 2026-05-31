import { TokenBucketRateLimiter } from '../rate-limiter';

describe('TokenBucketRateLimiter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('allows up to capacity calls then blocks until refill', async () => {
    const limiter = new TokenBucketRateLimiter({ capacity: 2, refillIntervalMs: 30_000 });
    const t0 = Date.now();
    await limiter.acquire();
    await limiter.acquire();
    expect(Date.now() - t0).toBe(0);

    const blocked = limiter.acquire();
    jest.advanceTimersByTime(30_000);
    await blocked;
  });

  it('refills to full capacity after one interval', async () => {
    const limiter = new TokenBucketRateLimiter({ capacity: 2, refillIntervalMs: 30_000 });
    await limiter.acquire();
    await limiter.acquire();
    jest.advanceTimersByTime(30_000);
    const next = limiter.acquire();
    await next;
  });

  it('drains multiple queued waiters fairly across windows', async () => {
    const limiter = new TokenBucketRateLimiter({ capacity: 2, refillIntervalMs: 30_000 });
    // Burn initial capacity
    await limiter.acquire();
    await limiter.acquire();

    // Queue 3 more (more than one window's capacity)
    const order: number[] = [];
    const w1 = limiter.acquire().then(() => order.push(1));
    const w2 = limiter.acquire().then(() => order.push(2));
    const w3 = limiter.acquire().then(() => order.push(3));

    // Window 1: should release 2 waiters (FIFO)
    await jest.advanceTimersByTimeAsync(30_000);
    await Promise.resolve(); // flush microtasks
    await Promise.resolve();
    await w1;
    await w2;
    expect(order).toEqual([1, 2]);

    // Window 2: should release the third waiter
    await jest.advanceTimersByTimeAsync(30_000);
    await w3;
    expect(order).toEqual([1, 2, 3]);
  });
});
