import { Logger } from '@nestjs/common';
import type { PrismaService } from '@autoscanner/database';
import type { ScanJobPayload } from '@autoscanner/queues';
import type { JobBus } from '@autoscanner/messaging';

const SCANNER_TOPIC = 'security.scanner.requested';

/**
 * Crash-recovery: on boot, re-enqueue every `ScanJob` row left in the
 * RUNNING status by a previous worker incarnation.
 *
 * Without this, a hard kill of scan-worker mid-Docker run leaves the row
 * RUNNING forever — the orchestrator's polling waits out the full step
 * budget (often >10 min) before flagging the step as TIMEOUT, and the
 * operator sees a phantom running scan that no worker is actually
 * processing.
 *
 * Re-enqueuing is safe because {@link ScanJobProcessor.process} re-runs
 * the Docker container from scratch and overwrites the previous attempt's
 * raw-output object at the same storage key. The new attempt's terminal
 * status update supersedes the previous RUNNING row state.
 *
 * Exposed as a stand-alone function (not bound to NestFactory) so a unit
 * test can exercise the logic with simple mocks.
 *
 * @returns number of re-enqueued ScanJobs.
 */
export async function reconcileRunningScanJobs(
  prisma: Pick<PrismaService, 'scanJob'>,
  bus: Pick<JobBus, 'publish'>,
  logger: Pick<Logger, 'log' | 'warn'> = new Logger('ScanWorkerReconcile'),
): Promise<number> {
  const rows = await prisma.scanJob.findMany({
    where: { status: 'RUNNING' },
    select: {
      id: true,
      scannerName: true,
      target: true,
      input: true,
      scan: { select: { engagementId: true } },
    },
  });

  if (rows.length === 0) {
    logger.log('Boot reconciliation: no RUNNING ScanJob rows to recover');
    return 0;
  }

  logger.log(`Boot reconciliation: re-enqueuing ${rows.length} RUNNING ScanJob(s)`);
  for (const row of rows) {
    try {
      await bus.publish<ScanJobPayload>(SCANNER_TOPIC, row.id, {
        scanJobId: row.id,
        scannerName: row.scannerName,
        target: row.target,
        input: row.input as Record<string, unknown>,
        engagementId: row.scan.engagementId,
      });
      logger.log(`Re-enqueued ScanJob ${row.id} (${row.scannerName} on ${row.target})`);
    } catch (err) {
      logger.warn(`Failed to re-enqueue ScanJob ${row.id}: ${(err as Error).message}`);
    }
  }
  return rows.length;
}
