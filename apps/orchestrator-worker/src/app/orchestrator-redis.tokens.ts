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
  on(event: 'message', listener: (channel: string, message: string) => void): void;
  off(event: 'message', listener: (channel: string, message: string) => void): void;
  quit(): Promise<unknown>;
}

/**
 * Builds the Redis pub/sub channel name used to notify completion of a ScanJob.
 * Today nothing publishes to this channel — the subscribe is a future-proof
 * hook. Polling is the load-bearing completion strategy. See
 * {@link StepExecutor} for the runtime contract.
 */
export function scanJobDoneChannel(scanJobId: string): string {
  return `scanjob:done:${scanJobId}`;
}
