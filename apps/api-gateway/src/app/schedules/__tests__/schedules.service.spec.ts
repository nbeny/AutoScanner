import { NotFoundError, ValidationError } from '@autoscanner/common';
import type { PrismaService } from '@autoscanner/database';

import { SchedulesService } from '../schedules.service';

const USER_ID = 'user_1';
const ENGAGEMENT_ID = 'eng_1';
const TEMPLATE_ID = 'tpl_1';

function makeSchedule(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'sch_1',
    engagementId: ENGAGEMENT_ID,
    templateId: TEMPLATE_ID,
    name: 'nightly recon',
    cronExpr: '0 2 * * *',
    timezone: 'UTC',
    targets: ['example.com'],
    config: null,
    enabled: true,
    lastRunAt: null,
    nextRunAt: new Date('2026-06-15T02:00:00Z'),
    lastTemplateRunId: null,
    createdById: USER_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    template: { id: TEMPLATE_ID, name: 'recon-passive', displayName: 'Passive Recon' },
    ...overrides,
  };
}

describe('SchedulesService', () => {
  let prisma: jest.Mocked<PrismaService>;
  let svc: SchedulesService;

  beforeEach(() => {
    prisma = {
      engagement: { findFirst: jest.fn() },
      scanTemplate: { findUnique: jest.fn() },
      schedule: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaService>;
    svc = new SchedulesService(prisma);
  });

  describe('create', () => {
    const validInput = {
      engagementId: ENGAGEMENT_ID,
      templateId: TEMPLATE_ID,
      name: 'nightly recon',
      cronExpr: '0 2 * * *',
      timezone: 'UTC',
      targets: ['example.com'],
    };

    it('creates a schedule with a computed nextRunAt', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValue({ id: ENGAGEMENT_ID });
      (prisma.scanTemplate.findUnique as jest.Mock).mockResolvedValue({ id: TEMPLATE_ID });
      (prisma.schedule.create as jest.Mock).mockImplementation(({ data }) =>
        Promise.resolve(makeSchedule(data)),
      );

      await svc.create(USER_ID, validInput);

      const createArg = (prisma.schedule.create as jest.Mock).mock.calls[0][0];
      expect(createArg.data).toEqual(
        expect.objectContaining({
          engagementId: ENGAGEMENT_ID,
          templateId: TEMPLATE_ID,
          name: 'nightly recon',
          cronExpr: '0 2 * * *',
          timezone: 'UTC',
          targets: ['example.com'],
          enabled: true,
          createdById: USER_ID,
        }),
      );
      expect(createArg.data.nextRunAt).toBeInstanceOf(Date);
      expect(createArg.include).toEqual({ template: true });
    });

    it('throws NotFoundError when the engagement does not belong to the user', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(svc.create(USER_ID, validInput)).rejects.toBeInstanceOf(NotFoundError);
      expect(prisma.schedule.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the template does not exist', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValue({ id: ENGAGEMENT_ID });
      (prisma.scanTemplate.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(svc.create(USER_ID, validInput)).rejects.toBeInstanceOf(NotFoundError);
      expect(prisma.schedule.create).not.toHaveBeenCalled();
    });

    it('throws ValidationError on an invalid cron expression', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValue({ id: ENGAGEMENT_ID });
      (prisma.scanTemplate.findUnique as jest.Mock).mockResolvedValue({ id: TEMPLATE_ID });
      await expect(
        svc.create(USER_ID, { ...validInput, cronExpr: 'NOT A CRON' }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(prisma.schedule.create).not.toHaveBeenCalled();
    });

    it('defaults timezone to UTC and enabled to true when omitted', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValue({ id: ENGAGEMENT_ID });
      (prisma.scanTemplate.findUnique as jest.Mock).mockResolvedValue({ id: TEMPLATE_ID });
      (prisma.schedule.create as jest.Mock).mockImplementation(({ data }) =>
        Promise.resolve(makeSchedule(data)),
      );

      await svc.create(USER_ID, {
        engagementId: ENGAGEMENT_ID,
        templateId: TEMPLATE_ID,
        name: 'n',
        cronExpr: '0 2 * * *',
        targets: ['example.com'],
      });

      const createArg = (prisma.schedule.create as jest.Mock).mock.calls[0][0];
      expect(createArg.data.timezone).toBe('UTC');
      expect(createArg.data.enabled).toBe(true);
    });
  });

  describe('listForOwner', () => {
    it('filters by engagement.ownerId, excludes soft-deleted, orders by createdAt desc', async () => {
      (prisma.schedule.findMany as jest.Mock).mockResolvedValue([]);
      await svc.listForOwner(USER_ID, ENGAGEMENT_ID);
      expect(prisma.schedule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            engagementId: ENGAGEMENT_ID,
            deletedAt: null,
            engagement: { ownerId: USER_ID, deletedAt: null },
          },
          include: { template: true },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });

  describe('update', () => {
    it('recomputes nextRunAt when cronExpr changes', async () => {
      (prisma.schedule.findFirst as jest.Mock).mockResolvedValue(makeSchedule());
      (prisma.schedule.update as jest.Mock).mockImplementation(({ data }) =>
        Promise.resolve(makeSchedule(data)),
      );

      await svc.update(USER_ID, 'sch_1', { cronExpr: '*/5 * * * *' });

      const updateArg = (prisma.schedule.update as jest.Mock).mock.calls[0][0];
      expect(updateArg.where).toEqual({ id: 'sch_1' });
      expect(updateArg.data.cronExpr).toBe('*/5 * * * *');
      expect(updateArg.data.nextRunAt).toBeInstanceOf(Date);
    });

    it('toggles enabled without recomputing nextRunAt when cron is unchanged', async () => {
      (prisma.schedule.findFirst as jest.Mock).mockResolvedValue(makeSchedule());
      (prisma.schedule.update as jest.Mock).mockImplementation(({ data }) =>
        Promise.resolve(makeSchedule(data)),
      );

      await svc.update(USER_ID, 'sch_1', { enabled: false });

      const updateArg = (prisma.schedule.update as jest.Mock).mock.calls[0][0];
      expect(updateArg.data.enabled).toBe(false);
      expect(updateArg.data.nextRunAt).toBeUndefined();
    });

    it('throws NotFoundError when the schedule is not owned by the user', async () => {
      (prisma.schedule.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(svc.update(USER_ID, 'missing', { enabled: false })).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(prisma.schedule.update).not.toHaveBeenCalled();
    });

    it('throws ValidationError when the new cron is invalid', async () => {
      (prisma.schedule.findFirst as jest.Mock).mockResolvedValue(makeSchedule());
      await expect(svc.update(USER_ID, 'sch_1', { cronExpr: 'nope' })).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(prisma.schedule.update).not.toHaveBeenCalled();
    });
  });

  describe('softDelete', () => {
    it('sets deletedAt and returns true', async () => {
      (prisma.schedule.findFirst as jest.Mock).mockResolvedValue(makeSchedule());
      (prisma.schedule.update as jest.Mock).mockResolvedValue(
        makeSchedule({ deletedAt: new Date() }),
      );
      const result = await svc.softDelete(USER_ID, 'sch_1');
      expect(result).toBe(true);
      const updateArg = (prisma.schedule.update as jest.Mock).mock.calls[0][0];
      expect(updateArg.where).toEqual({ id: 'sch_1' });
      expect(updateArg.data.deletedAt).toBeInstanceOf(Date);
    });

    it('throws NotFoundError when the schedule is not owned by the user', async () => {
      (prisma.schedule.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(svc.softDelete(USER_ID, 'missing')).rejects.toBeInstanceOf(NotFoundError);
      expect(prisma.schedule.update).not.toHaveBeenCalled();
    });
  });
});
