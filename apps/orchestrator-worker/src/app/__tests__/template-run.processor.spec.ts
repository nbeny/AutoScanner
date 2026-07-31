import type { PrismaService } from '@autoscanner/database';
import type { ConsumerRegistrar, MessageContext } from '@autoscanner/messaging';
import type { TemplateRunPayload } from '@autoscanner/queues';
import type { TemplateDefinition } from '@autoscanner/templates';
import { TemplateRegistry } from '@autoscanner/templates';
import {
  EngagementUpdateKind,
  type EngagementEventsPublisher,
} from '@autoscanner/engagement-events';

import { NotificationEventType, type NotificationsFanoutService } from '@autoscanner/notifications';

import type { StepExecutor } from '../step-executor.service';
import { TemplateRunProcessor } from '../template-run.processor';

function makeEvents(): jest.Mocked<EngagementEventsPublisher> {
  return { publish: jest.fn().mockResolvedValue(undefined) };
}

type TemplateRunRow = {
  id: string;
  templateId: string;
  templateName: string;
  engagementId: string;
  target: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  currentStepIndex: number;
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  template: { id: string; name: string };
};

function makeRow(overrides: Partial<TemplateRunRow> = {}): TemplateRunRow {
  return {
    id: 'run_1',
    templateId: 'tpl_1',
    templateName: 'recon-passive',
    engagementId: 'eng_1',
    target: 'example.com',
    status: 'PENDING',
    currentStepIndex: 0,
    startedAt: null,
    completedAt: null,
    errorMessage: null,
    createdById: 'user_1',
    createdAt: new Date(),
    updatedAt: new Date(),
    template: { id: 'tpl_1', name: 'recon-passive' },
    ...overrides,
  };
}

function makePrisma(row: TemplateRunRow): jest.Mocked<PrismaService> {
  return {
    templateRun: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(row),
      update: jest.fn().mockResolvedValue({}),
    },
  } as unknown as jest.Mocked<PrismaService>;
}

const TEMPLATE: TemplateDefinition = {
  name: 'recon-passive',
  displayName: 'Test Recon',
  description: 'unit-test',
  steps: [
    {
      scannerName: 'subfinder',
      inputs: {},
      target: { kind: 'context', path: 'target' },
    },
    {
      scannerName: 'httpx',
      inputs: {},
      target: { kind: 'context', path: 'subdomains' },
    },
  ],
};

function makeRegistry(): TemplateRegistry {
  const r = new TemplateRegistry();
  r.register(TEMPLATE);
  return r;
}

function makeExecutor(): jest.Mocked<StepExecutor> {
  return {
    runStep: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<StepExecutor>;
}

function makeFanout(): jest.Mocked<NotificationsFanoutService> {
  return {
    fanout: jest.fn().mockResolvedValue(0),
  } as unknown as jest.Mocked<NotificationsFanoutService>;
}

const job = (payload: TemplateRunPayload): MessageContext<TemplateRunPayload> => ({
  id: 'msg_1',
  type: 'security.scan.requested',
  key: payload.templateRunId,
  attempt: 1,
  payload,
});

describe('TemplateRunProcessor', () => {
  it('PENDING -> RUNNING -> COMPLETED happy path', async () => {
    const row = makeRow({ status: 'PENDING', currentStepIndex: 0 });
    const prisma = makePrisma(row);
    const registry = makeRegistry();
    const executor = makeExecutor();
    const fanout = makeFanout();
    const proc = new TemplateRunProcessor(prisma, registry, executor, makeEvents(), fanout, {
      register: jest.fn(),
    } as unknown as ConsumerRegistrar);

    await proc.process(job({ templateRunId: 'run_1', engagementId: 'eng_1' }));

    // Step 1: flip to RUNNING + set startedAt
    expect(prisma.templateRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run_1' },
        data: expect.objectContaining({
          status: 'RUNNING',
          startedAt: expect.any(Date),
        }),
      }),
    );

    // Each step persists currentStepIndex before executing
    expect(prisma.templateRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run_1' },
        data: { currentStepIndex: 0 },
      }),
    );
    expect(prisma.templateRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run_1' },
        data: { currentStepIndex: 1 },
      }),
    );

    expect(executor.runStep).toHaveBeenCalledTimes(2);
    expect(executor.runStep).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        stepIndex: 0,
        step: expect.objectContaining({ scannerName: 'subfinder' }),
      }),
    );
    expect(executor.runStep).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        stepIndex: 1,
        step: expect.objectContaining({ scannerName: 'httpx' }),
      }),
    );

    // Final flip to COMPLETED
    expect(prisma.templateRun.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'run_1' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          completedAt: expect.any(Date),
        }),
      }),
    );

    // Notification fanout fired with SCAN_COMPLETED
    expect(fanout.fanout).toHaveBeenCalledWith(
      NotificationEventType.SCAN_COMPLETED,
      expect.objectContaining({ engagementId: 'eng_1', templateRunId: 'run_1' }),
    );
  });

  it('resumes at currentStepIndex when the run was already partially executed', async () => {
    const row = makeRow({ status: 'RUNNING', currentStepIndex: 1, startedAt: new Date() });
    const prisma = makePrisma(row);
    const executor = makeExecutor();
    const proc = new TemplateRunProcessor(
      prisma,
      makeRegistry(),
      executor,
      makeEvents(),
      makeFanout(),
      { register: jest.fn() } as unknown as ConsumerRegistrar,
    );

    await proc.process(job({ templateRunId: 'run_1', engagementId: 'eng_1' }));

    // Only step 1 should run (step 0 was already done before the crash)
    expect(executor.runStep).toHaveBeenCalledTimes(1);
    expect(executor.runStep).toHaveBeenCalledWith(expect.objectContaining({ stepIndex: 1 }));
  });

  it('marks FAILED and re-throws when a step throws', async () => {
    const row = makeRow({ status: 'PENDING' });
    const prisma = makePrisma(row);
    const executor = makeExecutor();
    executor.runStep.mockRejectedValueOnce(new Error('docker boom'));
    const fanout = makeFanout();
    const proc = new TemplateRunProcessor(prisma, makeRegistry(), executor, makeEvents(), fanout, {
      register: jest.fn(),
    } as unknown as ConsumerRegistrar);

    await expect(
      proc.process(job({ templateRunId: 'run_1', engagementId: 'eng_1' })),
    ).rejects.toThrow('docker boom');

    expect(prisma.templateRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run_1' },
        data: expect.objectContaining({
          status: 'FAILED',
          errorMessage: 'docker boom',
          completedAt: expect.any(Date),
        }),
      }),
    );

    // Notification fanout fired with SCAN_FAILED before re-throw
    expect(fanout.fanout).toHaveBeenCalledWith(
      NotificationEventType.SCAN_FAILED,
      expect.objectContaining({ engagementId: 'eng_1', templateRunId: 'run_1' }),
    );
  });

  it('Already-CANCELLED -> early return, no executor calls, no status mutation', async () => {
    const row = makeRow({ status: 'CANCELLED' });
    const prisma = makePrisma(row);
    const executor = makeExecutor();
    const proc = new TemplateRunProcessor(
      prisma,
      makeRegistry(),
      executor,
      makeEvents(),
      makeFanout(),
      { register: jest.fn() } as unknown as ConsumerRegistrar,
    );

    await proc.process(job({ templateRunId: 'run_1', engagementId: 'eng_1' }));

    expect(executor.runStep).not.toHaveBeenCalled();
    expect(prisma.templateRun.update).not.toHaveBeenCalled();
  });

  it('Already-COMPLETED -> early return, no executor calls, no status mutation', async () => {
    const row = makeRow({ status: 'COMPLETED' });
    const prisma = makePrisma(row);
    const executor = makeExecutor();
    const proc = new TemplateRunProcessor(
      prisma,
      makeRegistry(),
      executor,
      makeEvents(),
      makeFanout(),
      { register: jest.fn() } as unknown as ConsumerRegistrar,
    );

    await proc.process(job({ templateRunId: 'run_1', engagementId: 'eng_1' }));

    expect(executor.runStep).not.toHaveBeenCalled();
    expect(prisma.templateRun.update).not.toHaveBeenCalled();
  });

  it('still re-throws the step error when the FAILED-status update itself fails', async () => {
    const row = makeRow({ status: 'PENDING' });
    const prisma = makePrisma(row);
    const executor = makeExecutor();
    executor.runStep.mockRejectedValueOnce(new Error('docker boom'));
    // Last update (FAILED reconciliation) rejects. The original 'docker boom'
    // must still be what bubbles up — otherwise the operator sees a DB error
    // instead of the actual step failure.
    (prisma.templateRun.update as jest.Mock)
      .mockResolvedValueOnce({}) // flip to RUNNING
      .mockResolvedValueOnce({}) // currentStepIndex = 0
      .mockRejectedValueOnce(new Error('db is down')); // FAILED reconciliation
    const proc = new TemplateRunProcessor(
      prisma,
      makeRegistry(),
      executor,
      makeEvents(),
      makeFanout(),
      { register: jest.fn() } as unknown as ConsumerRegistrar,
    );

    await expect(
      proc.process(job({ templateRunId: 'run_1', engagementId: 'eng_1' })),
    ).rejects.toThrow('docker boom');
  });

  describe('TEMPLATE_RUN_STATUS_CHANGED publication', () => {
    it('publishes RUNNING and COMPLETED transitions on happy path', async () => {
      const row = makeRow({ status: 'PENDING', currentStepIndex: 0 });
      const prisma = makePrisma(row);
      const events = makeEvents();
      const proc = new TemplateRunProcessor(
        prisma,
        makeRegistry(),
        makeExecutor(),
        events,
        makeFanout(),
        { register: jest.fn() } as unknown as ConsumerRegistrar,
      );

      await proc.process(job({ templateRunId: 'run_1', engagementId: 'eng_1' }));

      expect(events.publish).toHaveBeenCalledTimes(2);
      for (const [ev] of events.publish.mock.calls) {
        expect(ev.kind).toBe(EngagementUpdateKind.TEMPLATE_RUN_STATUS_CHANGED);
        expect(ev.engagementId).toBe('eng_1');
        expect(ev.templateRunId).toBe('run_1');
      }
    });

    it('publishes RUNNING and FAILED when a step throws', async () => {
      const row = makeRow({ status: 'PENDING' });
      const prisma = makePrisma(row);
      const executor = makeExecutor();
      executor.runStep.mockRejectedValueOnce(new Error('docker boom'));
      const events = makeEvents();
      const proc = new TemplateRunProcessor(
        prisma,
        makeRegistry(),
        executor,
        events,
        makeFanout(),
        { register: jest.fn() } as unknown as ConsumerRegistrar,
      );

      await expect(
        proc.process(job({ templateRunId: 'run_1', engagementId: 'eng_1' })),
      ).rejects.toThrow('docker boom');

      expect(events.publish).toHaveBeenCalledTimes(2);
      const kinds = events.publish.mock.calls.map(([ev]) => ev.kind);
      expect(kinds).toEqual([
        EngagementUpdateKind.TEMPLATE_RUN_STATUS_CHANGED,
        EngagementUpdateKind.TEMPLATE_RUN_STATUS_CHANGED,
      ]);
    });

    it('does not publish for early-return CANCELLED/COMPLETED rows', async () => {
      const row = makeRow({ status: 'CANCELLED' });
      const prisma = makePrisma(row);
      const events = makeEvents();
      const proc = new TemplateRunProcessor(
        prisma,
        makeRegistry(),
        makeExecutor(),
        events,
        makeFanout(),
        { register: jest.fn() } as unknown as ConsumerRegistrar,
      );

      await proc.process(job({ templateRunId: 'run_1', engagementId: 'eng_1' }));

      expect(events.publish).not.toHaveBeenCalled();
    });

    it('does not throw when publisher rejects', async () => {
      const row = makeRow({ status: 'PENDING' });
      const prisma = makePrisma(row);
      const events: jest.Mocked<EngagementEventsPublisher> = {
        publish: jest.fn().mockRejectedValue(new Error('redis down')),
      };
      const proc = new TemplateRunProcessor(
        prisma,
        makeRegistry(),
        makeExecutor(),
        events,
        makeFanout(),
        { register: jest.fn() } as unknown as ConsumerRegistrar,
      );

      await expect(
        proc.process(job({ templateRunId: 'run_1', engagementId: 'eng_1' })),
      ).resolves.toBeUndefined();
    });
  });

  it('preserves existing startedAt on resume (does not overwrite)', async () => {
    const startedAt = new Date('2024-01-01T00:00:00Z');
    const row = makeRow({ status: 'RUNNING', currentStepIndex: 0, startedAt });
    const prisma = makePrisma(row);
    const executor = makeExecutor();
    const proc = new TemplateRunProcessor(
      prisma,
      makeRegistry(),
      executor,
      makeEvents(),
      makeFanout(),
      { register: jest.fn() } as unknown as ConsumerRegistrar,
    );

    await proc.process(job({ templateRunId: 'run_1', engagementId: 'eng_1' }));

    expect(prisma.templateRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run_1' },
        data: expect.objectContaining({ status: 'RUNNING', startedAt }),
      }),
    );
  });
});
