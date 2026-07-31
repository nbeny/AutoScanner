import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { PrismaService } from '@autoscanner/database';
import type { TemplateRunPayload } from '@autoscanner/queues';
import { ConsumerRegistrar, MessageConsumer, type MessageContext } from '@autoscanner/messaging';
import { TemplateRegistry } from '@autoscanner/templates';
import {
  ENGAGEMENT_EVENTS_PUBLISHER,
  EngagementUpdateKind,
  type EngagementEventsPublisher,
} from '@autoscanner/engagement-events';
import { NotificationEventType, NotificationsFanoutService } from '@autoscanner/notifications';

import { StepExecutor } from './step-executor.service';

const SCAN_RUN_TOPIC = 'security.scan.requested';

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
 *  6. On any step throw: flip to FAILED + `errorMessage` + re-throw so the
 *     retry/DLQ policy records the failure.
 */
@Injectable()
export class TemplateRunProcessor
  extends MessageConsumer<TemplateRunPayload>
  implements OnApplicationBootstrap
{
  readonly topic = SCAN_RUN_TOPIC;
  private readonly logger = new Logger(TemplateRunProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: TemplateRegistry,
    private readonly executor: StepExecutor,
    @Inject(ENGAGEMENT_EVENTS_PUBLISHER)
    private readonly events: EngagementEventsPublisher,
    private readonly fanout: NotificationsFanoutService,
    @Inject(ConsumerRegistrar) private readonly registrar: ConsumerRegistrar,
  ) {
    super();
  }

  private publishStatusChange(engagementId: string, templateRunId: string): void {
    this.events
      .publish({
        kind: EngagementUpdateKind.TEMPLATE_RUN_STATUS_CHANGED,
        engagementId,
        templateRunId,
        ts: new Date().toISOString(),
      })
      .catch((err: unknown) => {
        this.logger.warn(
          `TEMPLATE_RUN_STATUS_CHANGED publish failed for ${templateRunId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.registrar.register(this);
  }

  async process(ctx: MessageContext<TemplateRunPayload>): Promise<void> {
    const { templateRunId } = ctx.payload;

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
    this.publishStatusChange(run.engagementId, run.id);

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
      this.publishStatusChange(run.engagementId, run.id);
      await this.fanout
        .fanout(NotificationEventType.SCAN_COMPLETED, {
          engagementId: run.engagementId,
          templateRunId: run.id,
        })
        .catch((e) => this.logger.warn(`notification fanout failed: ${(e as Error).message}`));
      this.logger.log(`TemplateRun ${run.id} COMPLETED`);
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`TemplateRun ${run.id} FAILED: ${message}`);
      // Swallow update failures so the original step error surfaces to
      // BullMQ. Without this, a transient DB blip during status reconciliation
      // would mask the actual root cause and leave the run in RUNNING (boot
      // reconciliation would re-pick it up, but the operator would see a
      // misleading "DB error" stack instead of the step failure).
      await this.prisma.templateRun
        .update({
          where: { id: run.id },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            errorMessage: message,
          },
        })
        .catch((updateErr) => {
          this.logger.warn(
            `TemplateRun ${run.id} status reconciliation failed: ${(updateErr as Error).message}`,
          );
        });
      this.publishStatusChange(run.engagementId, run.id);
      await this.fanout
        .fanout(NotificationEventType.SCAN_FAILED, {
          engagementId: run.engagementId,
          templateRunId: run.id,
        })
        .catch((e) => this.logger.warn(`notification fanout failed: ${(e as Error).message}`));
      throw err;
    }
  }
}
