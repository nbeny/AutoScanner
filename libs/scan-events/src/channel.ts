/**
 * The single definition of the ScanJob completion pub/sub channel (SP3).
 *
 * scan-worker PUBLISHes a `{ scanJobId, status }` wake-up here on every terminal outcome; the
 * orchestrator's StepExecutor and the AutoHunt ScanDispatcher SUBSCRIBE (before creating the
 * ScanJob) and re-read Postgres on the wake-up. Redis pub/sub is at-most-once, so each waiter
 * also keeps a long fallback poll.
 */
export function scanJobDoneChannel(scanJobId: string): string {
  return `scanjob:done:${scanJobId}`;
}
