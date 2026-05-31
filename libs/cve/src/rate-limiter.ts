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
  private timerPending = false;

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
    if (this.timerPending) return;
    this.timerPending = true;
    const delay = this.refillIntervalMs - (Date.now() - this.lastRefill);
    setTimeout(
      () => {
        this.timerPending = false;
        this.refill();
        // If waiters remain after refill (because new capacity is still smaller than queue),
        // schedule another refill for the following window.
        if (this.waiters.length > 0) this.scheduleNextRefill();
      },
      Math.max(delay, 1),
    );
  }
}
