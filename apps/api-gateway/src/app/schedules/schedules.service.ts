import { Injectable, Logger } from '@nestjs/common';
import { CronExpressionParser } from 'cron-parser';
import { Prisma } from '@prisma/client';
import type { Schedule, ScanTemplate } from '@prisma/client';

import { NotFoundError, ValidationError } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';

import { CreateScheduleInput } from './dto/create-schedule.input';
import { UpdateScheduleInput } from './dto/update-schedule.input';

export type ScheduleWithTemplate = Schedule & { template: ScanTemplate };

@Injectable()
export class SchedulesService {
  private readonly logger = new Logger(SchedulesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, input: CreateScheduleInput): Promise<ScheduleWithTemplate> {
    const engagement = await this.prisma.engagement.findFirst({
      where: { id: input.engagementId, ownerId: userId, deletedAt: null },
      select: { id: true },
    });
    if (!engagement) throw new NotFoundError('Engagement', input.engagementId);

    const template = await this.prisma.scanTemplate.findUnique({
      where: { id: input.templateId },
      select: { id: true },
    });
    if (!template) throw new NotFoundError('ScanTemplate', input.templateId);

    const timezone = input.timezone ?? 'UTC';
    const nextRunAt = this.computeNextRun(input.cronExpr, timezone);

    const created = (await this.prisma.schedule.create({
      data: {
        engagementId: input.engagementId,
        templateId: input.templateId,
        name: input.name,
        cronExpr: input.cronExpr,
        timezone,
        targets: input.targets,
        config: input.config ? (input.config as Prisma.InputJsonValue) : Prisma.JsonNull,
        enabled: input.enabled ?? true,
        nextRunAt,
        createdById: userId,
      },
      include: { template: true },
    })) as ScheduleWithTemplate;

    this.logger.log(`Created schedule=${created.id} engagement=${input.engagementId}`);
    return created;
  }

  listForOwner(userId: string, engagementId: string): Promise<ScheduleWithTemplate[]> {
    return this.prisma.schedule.findMany({
      where: {
        engagementId,
        deletedAt: null,
        engagement: { ownerId: userId, deletedAt: null },
      },
      include: { template: true },
      orderBy: { createdAt: 'desc' },
    }) as Promise<ScheduleWithTemplate[]>;
  }

  getForOwner(userId: string, id: string): Promise<ScheduleWithTemplate> {
    return this.requireOwned(userId, id);
  }

  async update(
    userId: string,
    id: string,
    input: UpdateScheduleInput,
  ): Promise<ScheduleWithTemplate> {
    const existing = await this.requireOwned(userId, id);

    const data: Prisma.ScheduleUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.targets !== undefined) data.targets = input.targets;
    if (input.enabled !== undefined) data.enabled = input.enabled;
    if (input.config !== undefined) {
      data.config = input.config ? (input.config as Prisma.InputJsonValue) : Prisma.JsonNull;
    }

    const nextCron = input.cronExpr ?? existing.cronExpr;
    const nextTz = input.timezone ?? existing.timezone;
    if (input.cronExpr !== undefined) data.cronExpr = input.cronExpr;
    if (input.timezone !== undefined) data.timezone = input.timezone;
    if (input.cronExpr !== undefined || input.timezone !== undefined) {
      data.nextRunAt = this.computeNextRun(nextCron, nextTz);
    }

    return this.prisma.schedule.update({
      where: { id },
      data,
      include: { template: true },
    }) as Promise<ScheduleWithTemplate>;
  }

  async softDelete(userId: string, id: string): Promise<boolean> {
    await this.requireOwned(userId, id);
    await this.prisma.schedule.update({
      where: { id },
      data: { deletedAt: new Date(), enabled: false },
    });
    this.logger.log(`Soft-deleted schedule=${id}`);
    return true;
  }

  private async requireOwned(userId: string, id: string): Promise<ScheduleWithTemplate> {
    const found = await this.prisma.schedule.findFirst({
      where: {
        id,
        deletedAt: null,
        engagement: { ownerId: userId, deletedAt: null },
      },
      include: { template: true },
    });
    if (!found) throw new NotFoundError('Schedule', id);
    return found as ScheduleWithTemplate;
  }

  private computeNextRun(cronExpr: string, timezone: string): Date {
    try {
      return CronExpressionParser.parse(cronExpr, { tz: timezone }).next().toDate();
    } catch (err) {
      throw new ValidationError(`Invalid cron expression "${cronExpr}" (tz=${timezone})`, err);
    }
  }
}
