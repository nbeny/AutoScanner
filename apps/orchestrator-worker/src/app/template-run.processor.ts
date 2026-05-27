import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { PrismaService } from '@autoscanner/database';
import { QueueName, type TemplateRunPayload } from '@autoscanner/queues';
import { TemplateRegistry } from '@autoscanner/templates';

import { StepExecutor } from './step-executor.service';

/**
 * Linear executor for `TemplateRun` jobs.
 *
 * Lifecycle:
 *  1. Read the `TemplateRun` row (with its `template` relation).
 *  2. If already CANCELLED or COMPLETED -> noop (idempotent for at-least-once
 *     redelivery).
 *  3. Flip status to RUNNING (preserving `startedAt` if present, so crash
 *     recovery keeps original wallclock).
 *  4. For each step in `template.steps`, starting at `run.currentStepIndex`:
 *      - Persist `currentStepIndex` (lets crash-recovery resume from the
 *        last attempted step rather than re-running already-completed work).
 *      - Delegate to {@link StepExecutor.runStep} which fans out ScanJobs and
 *        waits for completion.
 *  5. On all-green: flip to COMPLETED + `completedAt`.
 *  6. On any step throw: flip to FAILED + `errorMessage` + re-throw so BullMQ
 *     records the job as failed.
 */
@Processor(QueueName.TEMPLATE_RUNS)
export class TemplateRunProcessor extends WorkerHost {
  private readonly logger = new Logger(TemplateRunProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: TemplateRegistry,
    private readonly executor: StepExecutor,
  ) {
    super();
  }

  async process(job: Job<TemplateRunPayload>): Promise<void> {
    const { templateRunId } = job.data;

    const run = await this.prisma.templateRun.findUniqueOrThrow({
      where: { id: templateRunId },
      include: { template: true },
    });

    if (run.status === 'CANCELLED' || run.status === 'COMPLETED') {
      this.logger.log(`TemplateRun ${run.id} already in terminal status=${run.status} — skipping`);
      return;
    }

    const template = this.registry.get(run.templateName);

    await this.prisma.templateRun.update({
      where: { id: run.id },
      data: {
        status: 'RUNNING',
        startedAt: run.startedAt ?? new Date(),
      },
    });

    this.logger.log(
      `TemplateRun ${run.id} (${run.templateName}) starting at step ${run.currentStepIndex}/${template.steps.length}`,
    );

    try {
      for (let i = run.currentStepIndex; i < template.steps.length; i++) {
        await this.prisma.templateRun.update({
          where: { id: run.id },
          data: { currentStepIndex: i },
        });
        const step = template.steps[i];
        await this.executor.runStep({
          templateRun: run,
          step,
          stepIndex: i,
        });
      }

      await this.prisma.templateRun.update({
        where: { id: run.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });
      this.logger.log(`TemplateRun ${run.id} COMPLETED`);
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`TemplateRun ${run.id} FAILED: ${message}`);
      await this.prisma.templateRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorMessage: message,
        },
      });
      throw err;
    }
  }
}
