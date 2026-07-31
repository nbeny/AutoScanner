import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { CronExpressionParser } from 'cron-parser';
import type { Prisma, Schedule } from '@prisma/client';

import { PrismaService } from '@autoscanner/database';
import { type TemplateRunPayload } from '@autoscanner/queues';
import { JOB_BUS, type JobBus } from '@autoscanner/messaging';

const SCAN_RUN_TOPIC = 'security.scan.requested';

const DEFAULT_POLL_INTERVAL_MS = 30_000;

export interface PollResult {
  scanned: number;
  enqueued: number;
}

interface EnqueueTask {
  templateRunId: string;
  engagementId: string;
}

@Injectable()
export class ScheduleHydrator implements OnModuleDestroy {
  private readonly logger = new Logger(ScheduleHydrator.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(JOB_BUS) private readonly bus: JobBus,
  ) {}

  start(intervalMs: number = readIntervalMs()): void {
    if (this.timer) return;
    // Fire-and-forget the first poll. We don't await it inside start() so the
    // bootstrap path can return immediately and the worker's signal handlers
    // get installed before any DB query lands.
    void this.safePoll();
    this.timer = setInterval(() => void this.safePoll(), intervalMs);
    this.logger.log(`scheduler hydrator started (interval=${intervalMs}ms)`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async safePoll(): Promise<void> {
    if (this.running) return; // skip overlapping ticks
    this.running = true;
    try {
      const { scanned, enqueued } = await this.pollOnce();
      if (scanned > 0 || enqueued > 0) {
        this.logger.log(`hydrated ${scanned} schedule(s), enqueued ${enqueued} templateRun(s)`);
      }
    } catch (err) {
      this.logger.error(
        `schedule poll failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.running = false;
    }
  }

  async pollOnce(now: Date = new Date()): Promise<PollResult> {
    const due = await this.prisma.schedule.findMany({
      where: {
        enabled: true,
        deletedAt: null,
        OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }],
      },
    });

    let enqueued = 0;
    for (const schedule of due) {
      const tasks = await this.advanceSchedule(schedule, now);
      // Side-effects only after the DB transaction commits. If the publish
      // throws here, the TemplateRun row is still PENDING in DB and the
      // orchestrator-worker reconcile path (see `reconcile.ts`) picks it up
      // at next boot — same recovery contract as TemplatesService.
      for (const task of tasks) {
        await this.bus.publish<TemplateRunPayload>(SCAN_RUN_TOPIC, task.templateRunId, {
          templateRunId: task.templateRunId,
          engagementId: task.engagementId,
        });
        enqueued += 1;
      }
    }
    return { scanned: due.length, enqueued };
  }

  private async advanceSchedule(schedule: Schedule, now: Date): Promise<EnqueueTask[]> {
    const nextDue = this.computeNextDue(schedule, now);
    if (!nextDue) return [];

    // First initialisation: just plant nextRunAt, do not retro-run.
    if (schedule.nextRunAt === null) {
      await this.prisma.schedule.update({
        where: { id: schedule.id },
        data: { nextRunAt: nextDue },
      });
      return [];
    }

    if (schedule.targets.length === 0) {
      this.logger.warn(`schedule ${schedule.id} has no targets — skipping`);
      await this.prisma.schedule.update({
        where: { id: schedule.id },
        data: { nextRunAt: nextDue, lastRunAt: now },
      });
      return [];
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const created: { id: string }[] = [];
      for (const target of schedule.targets) {
        const run = await tx.templateRun.create({
          data: {
            templateId: schedule.templateId,
            templateName: '', // backfilled below from ScanTemplate
            engagementId: schedule.engagementId,
            target,
            status: 'PENDING',
            currentStepIndex: 0,
            createdById: schedule.createdById,
            scheduleId: schedule.id,
          } satisfies Prisma.TemplateRunUncheckedCreateInput,
          select: { id: true },
        });
        created.push(run);
      }
      await tx.schedule.update({
        where: { id: schedule.id },
        data: {
          lastRunAt: now,
          lastTemplateRunId: created[created.length - 1]?.id ?? null,
          nextRunAt: nextDue,
        },
      });
      return created;
    });

    // Backfill templateName outside the transaction. The orchestrator only
    // reads templateId; templateName is a denormalised convenience used by
    // GraphQL/UI. Looking it up post-commit keeps the transaction trim and
    // avoids holding a row lock on ScanTemplate during the fan-out.
    const template = await this.prisma.scanTemplate.findUnique({
      where: { id: schedule.templateId },
      select: { name: true },
    });
    if (template) {
      await this.prisma.templateRun.updateMany({
        where: { id: { in: result.map((r) => r.id) } },
        data: { templateName: template.name },
      });
    }

    return result.map((r) => ({
      templateRunId: r.id,
      engagementId: schedule.engagementId,
    }));
  }

  private computeNextDue(schedule: Schedule, now: Date): Date | null {
    try {
      const it = CronExpressionParser.parse(schedule.cronExpr, {
        tz: schedule.timezone,
        currentDate: now,
      });
      return it.next().toDate();
    } catch (err) {
      this.logger.error(
        `schedule ${schedule.id} has invalid cron "${schedule.cronExpr}" tz=${schedule.timezone}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }
}

function readIntervalMs(): number {
  const raw = process.env['SCHEDULER_POLL_INTERVAL_MS'];
  if (!raw) return DEFAULT_POLL_INTERVAL_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_POLL_INTERVAL_MS;
}
