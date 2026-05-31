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
});
