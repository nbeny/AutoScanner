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
 * The Redis pub/sub channel used to notify completion of a ScanJob. Since SP3 scan-worker
 * publishes to it on every terminal outcome, so the push is the primary completion path and the
 * poll is a lost-message fallback. Re-exported from `@autoscanner/scan-events` so producer and
 * consumers share ONE definition.
 */
export { scanJobDoneChannel } from '@autoscanner/scan-events';
