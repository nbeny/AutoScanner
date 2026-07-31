import { Logger } from '@nestjs/common';
import type { PrismaService } from '@autoscanner/database';
import type { TemplateRunPayload } from '@autoscanner/queues';
import type { JobBus } from '@autoscanner/messaging';

const SCAN_RUN_TOPIC = 'security.scan.requested';

/**
 * Crash-recovery: on boot, re-enqueue every `TemplateRun` row left in the
 * RUNNING status by a previous worker incarnation. The
 * {@link TemplateRunProcessor} reads `run.currentStepIndex` and resumes from
 * the last attempted step, so re-enqueuing is safe and idempotent.
 *
 * Exposed as a stand-alone function (not bound to NestFactory) so a unit test
 * can exercise the logic with simple mocks.
 *
 * @returns number of re-enqueued TemplateRuns.
 */
export async function reconcileRunningTemplateRuns(
  prisma: Pick<PrismaService, 'templateRun'>,
  bus: Pick<JobBus, 'publish'>,
  logger: Pick<Logger, 'log' | 'warn'> = new Logger('OrchestratorReconcile'),
): Promise<number> {
  const runs = await prisma.templateRun.findMany({
    where: { status: 'RUNNING' },
    select: { id: true, engagementId: true, templateName: true, currentStepIndex: true },
  });

  if (runs.length === 0) {
    logger.log('Boot reconciliation: no RUNNING TemplateRun rows to recover');
    return 0;
  }

  logger.log(`Boot reconciliation: re-enqueuing ${runs.length} RUNNING TemplateRun(s)`);
  for (const run of runs) {
    try {
      await bus.publish<TemplateRunPayload>(SCAN_RUN_TOPIC, run.id, {
        templateRunId: run.id,
        engagementId: run.engagementId,
      });
      logger.log(
        `Re-enqueued TemplateRun ${run.id} (${run.templateName}) @ step ${run.currentStepIndex}`,
      );
    } catch (err) {
      logger.warn(`Failed to re-enqueue TemplateRun ${run.id}: ${(err as Error).message}`);
    }
  }
  return runs.length;
}
