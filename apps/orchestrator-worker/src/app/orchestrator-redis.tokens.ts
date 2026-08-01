/**
 * Provider token for the Redis subscriber client used by the orchestrator to
 * listen on `scanjob:done:<scanJobId>` notification channels.
 *
 * The subscriber is wired in `app.module.ts` and consumed by
 * {@link import('./step-executor.service').StepExecutor}. Tests may swap the
 * implementation with `Test.createTestingModule().overrideProvider(...)`.
 */
export const ORCHESTRATOR_REDIS_SUBSCRIBER = Symbol('ORCHESTRATOR_REDIS_SUBSCRIBER');

/**
 * Minimal contract the {@link StepExecutor} requires from the Redis subscriber
 * client. Implemented in production by `ioredis`, stubbed in tests.
 */
export interface OrchestratorRedisSubscriber {
  subscribe(channel: string): Promise<unknown>;
  unsubscribe(channel: string): Promise<unknown>;
  // A single shared `message` listener is bound at most once (see
  // `StepExecutor.bindListenerOnce`). Per-channel dispatch is done via a
  // Map; there is no `off()` because we never unbind. Keeping the surface
  // narrow makes the test double honest.
  on(event: 'message', listener: (channel: string, message: string) => void): void;
  quit(): Promise<unknown>;
}

/**
 * The Redis pub/sub channel used to notify completion of a ScanJob. Since SP3 scan-worker
 * publishes to it on every terminal outcome, so the push is the primary completion path and the
 * poll is a lost-message fallback (see {@link StepExecutor}). Re-exported from
 * `@autoscanner/scan-events` so producer and consumers share ONE definition.
 */
export { scanJobDoneChannel } from '@autoscanner/scan-events';
