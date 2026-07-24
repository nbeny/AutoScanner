/**
 * Provider token for the Redis subscriber client used by the {@link ScanDispatcher}
 * to listen on `scanjob:done:<scanJobId>` notification channels.
 *
 * The subscriber is wired by the CONSUMER app (mirroring how the
 * orchestrator-worker provides `ORCHESTRATOR_REDIS_SUBSCRIBER`). Tests swap the
 * implementation with a stub.
 */
export const SCAN_DISPATCH_REDIS_SUBSCRIBER = Symbol('SCAN_DISPATCH_REDIS_SUBSCRIBER');

/**
 * Minimal contract the {@link ScanDispatcher} requires from the Redis subscriber
 * client. Implemented in production by `ioredis`, stubbed in tests.
 */
export interface ScanDispatchRedisSubscriber {
  subscribe(channel: string): Promise<unknown>;
  unsubscribe(channel: string): Promise<unknown>;
  // A single shared `message` listener is bound at most once. Per-channel
  // dispatch is done via a Map; there is no `off()` because we never unbind.
  on(event: 'message', listener: (channel: string, message: string) => void): void;
  quit(): Promise<unknown>;
}

/**
 * Builds the Redis pub/sub channel name used to notify completion of a ScanJob.
 * Today nothing publishes to this channel — the subscribe is a future-proof
 * hook. Polling is the load-bearing completion strategy.
 */
export function scanJobDoneChannel(scanJobId: string): string {
  return `scanjob:done:${scanJobId}`;
}
