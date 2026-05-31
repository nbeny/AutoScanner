export interface TokenBucketOptions {
  capacity: number;
  refillIntervalMs: number;
}

export class TokenBucketRateLimiter {
  private tokens: number;
  private readonly capacity: number;
  private readonly refillIntervalMs: number;
  private lastRefill: number;
  private waiters: Array<() => void> = [];

  constructor(opts: TokenBucketOptions) {
    this.capacity = opts.capacity;
    this.refillIntervalMs = opts.refillIntervalMs;
    this.tokens = opts.capacity;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens > 0) {
      this.tokens -= 1;
      return;
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
      this.scheduleNextRefill();
    });
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed >= this.refillIntervalMs) {
      this.tokens = this.capacity;
      this.lastRefill = now;
      while (this.waiters.length > 0 && this.tokens > 0) {
        const waiter = this.waiters.shift();
        this.tokens -= 1;
        waiter?.();
      }
    }
  }

  private scheduleNextRefill(): void {
    const delay = this.refillIntervalMs - (Date.now() - this.lastRefill);
    setTimeout(() => this.refill(), Math.max(delay, 1));
  }
}
