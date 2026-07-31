import { Test } from '@nestjs/testing';
import { JOB_BUS } from '@autoscanner/messaging';
import type { Schedule } from '@prisma/client';

import { PrismaService } from '@autoscanner/database';

import { ScheduleHydrator } from '../schedule-hydrator.service';

const NOW = new Date('2026-06-12T10:00:00Z');

function makeSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: 'sch-1',
    engagementId: 'eng-1',
    templateId: 'tpl-1',
    name: 'nightly',
    cronExpr: '0 2 * * *',
    timezone: 'UTC',
    targets: ['example.com'],
    config: null,
    enabled: true,
    lastRunAt: null,
    nextRunAt: null,
    lastTemplateRunId: null,
    createdById: 'u-1',
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

interface PrismaMock {
  schedule: {
    findMany: jest.Mock;
    update: jest.Mock;
  };
  templateRun: {
    // outer-only: updateMany. `create` is reused from the tx client so tests
    // can configure it via prisma.templateRun.create.mockResolvedValueOnce
    // regardless of whether the call lands inside or outside a $transaction.
    create: jest.Mock;
    updateMany: jest.Mock;
  };
  scanTemplate: {
    findUnique: jest.Mock;
  };
  $transaction: jest.Mock;
}

function buildPrismaMock(): PrismaMock {
  // Single create mock shared with the tx client so test setup is
  // straightforward: tests configure prisma.templateRun.create directly.
  const sharedTemplateRunCreate = jest.fn();
  const sharedScheduleUpdate = jest.fn();
  const txClient = {
    templateRun: { create: sharedTemplateRunCreate },
    schedule: { update: sharedScheduleUpdate },
  };
  return {
    schedule: {
      findMany: jest.fn(),
      update: sharedScheduleUpdate,
    },
    templateRun: {
      create: sharedTemplateRunCreate,
      updateMany: jest.fn(),
    },
    scanTemplate: {
      findUnique: jest.fn().mockResolvedValue({ name: 'recon-passive' }),
    },
    $transaction: jest.fn(async (cb: (tx: typeof txClient) => Promise<unknown>) => cb(txClient)),
  } as unknown as PrismaMock;
}

async function buildHydrator(
  prisma: PrismaMock,
  bus: { publish: jest.Mock },
): Promise<ScheduleHydrator> {
  const module = await Test.createTestingModule({
    providers: [
      ScheduleHydrator,
      { provide: PrismaService, useValue: prisma },
      { provide: JOB_BUS, useValue: bus },
    ],
  }).compile();
  return module.get(ScheduleHydrator);
}

describe('ScheduleHydrator', () => {
  let prisma: PrismaMock;
  let bus: { publish: jest.Mock };
  let hydrator: ScheduleHydrator;

  beforeEach(async () => {
    prisma = buildPrismaMock();
    bus = { publish: jest.fn().mockResolvedValue(undefined) };
    hydrator = await buildHydrator(prisma, bus);
  });

  it('plants nextRunAt without enqueuing on first hydration', async () => {
    const schedule = makeSchedule({ nextRunAt: null });
    prisma.schedule.findMany.mockResolvedValue([schedule]);

    const result = await hydrator.pollOnce(NOW);

    expect(result).toEqual({ scanned: 1, enqueued: 0 });
    expect(prisma.schedule.update).toHaveBeenCalledWith({
      where: { id: 'sch-1' },
      data: { nextRunAt: expect.any(Date) },
    });
    const plantedNext = prisma.schedule.update.mock.calls[0][0].data.nextRunAt as Date;
    // next "0 2 * * *" UTC tick from 2026-06-12T10:00:00Z is 2026-06-13T02:00:00Z
    expect(plantedNext.toISOString()).toBe('2026-06-13T02:00:00.000Z');
    expect(bus.publish).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('enqueues one templateRun per target when nextRunAt is due', async () => {
    const schedule = makeSchedule({
      nextRunAt: new Date('2026-06-12T09:59:00Z'),
      lastRunAt: new Date('2026-06-11T02:00:00Z'),
      targets: ['a.example.com', 'b.example.com', 'c.example.com'],
    });
    prisma.schedule.findMany.mockResolvedValue([schedule]);
    prisma.templateRun.create
      .mockResolvedValueOnce({ id: 'run-1' })
      .mockResolvedValueOnce({ id: 'run-2' })
      .mockResolvedValueOnce({ id: 'run-3' });

    const result = await hydrator.pollOnce(NOW);

    expect(result).toEqual({ scanned: 1, enqueued: 3 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(bus.publish).toHaveBeenCalledTimes(3);
    expect(bus.publish).toHaveBeenNthCalledWith(1, 'security.scan.requested', expect.any(String), {
      templateRunId: 'run-1',
      engagementId: 'eng-1',
    });
    expect(prisma.templateRun.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['run-1', 'run-2', 'run-3'] } },
      data: { templateName: 'recon-passive' },
    });
  });

  it('respects Europe/Paris timezone when computing next due', async () => {
    // 2026-06-12T01:00:00+02:00 == 2025-06-11T23:00:00Z, but cron "0 2 * * *"
    // in Europe/Paris (CEST = +02:00) should fire at 2026-06-12T02:00:00+02:00
    // which is 2026-06-12T00:00:00Z.
    const earlyMorning = new Date('2026-06-11T23:00:00Z');
    const schedule = makeSchedule({
      timezone: 'Europe/Paris',
      cronExpr: '0 2 * * *',
      nextRunAt: null,
    });
    prisma.schedule.findMany.mockResolvedValue([schedule]);

    await hydrator.pollOnce(earlyMorning);

    const planted = prisma.schedule.update.mock.calls[0][0].data.nextRunAt as Date;
    expect(planted.toISOString()).toBe('2026-06-12T00:00:00.000Z');
  });

  it('skips invalid cron expressions without throwing', async () => {
    prisma.schedule.findMany.mockResolvedValue([makeSchedule({ cronExpr: 'NOT A CRON' })]);

    const result = await hydrator.pollOnce(NOW);

    expect(result).toEqual({ scanned: 1, enqueued: 0 });
    expect(prisma.schedule.update).not.toHaveBeenCalled();
    expect(bus.publish).not.toHaveBeenCalled();
  });

  it('keeps the templateRun row PENDING when bus.publish throws after commit', async () => {
    const schedule = makeSchedule({
      nextRunAt: new Date('2026-06-12T09:59:00Z'),
      targets: ['example.com'],
    });
    prisma.schedule.findMany.mockResolvedValue([schedule]);
    prisma.templateRun.create.mockResolvedValueOnce({ id: 'run-1' });
    bus.publish.mockRejectedValueOnce(new Error('redis down'));

    await expect(hydrator.pollOnce(NOW)).rejects.toThrow('redis down');

    // Transaction already committed before the failing enqueue, so we did not
    // try to roll back templateRun.create. The orchestrator reconcile path
    // will pick the row up at next boot.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('updates lastRunAt + nextRunAt only (no enqueue) when targets[] is empty', async () => {
    prisma.schedule.findMany.mockResolvedValue([
      makeSchedule({
        nextRunAt: new Date('2026-06-12T09:59:00Z'),
        targets: [],
      }),
    ]);

    const result = await hydrator.pollOnce(NOW);

    expect(result).toEqual({ scanned: 1, enqueued: 0 });
    expect(bus.publish).not.toHaveBeenCalled();
    expect(prisma.schedule.update).toHaveBeenCalledWith({
      where: { id: 'sch-1' },
      data: { nextRunAt: expect.any(Date), lastRunAt: NOW },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
