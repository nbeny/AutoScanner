import type { Queue } from 'bullmq';
import type { PrismaService } from '@autoscanner/database';
import type { TemplateRunPayload } from '@autoscanner/queues';

import { reconcileRunningTemplateRuns } from '../reconcile';

const silentLogger = {
  log: jest.fn(),
  warn: jest.fn(),
};

describe('reconcileRunningTemplateRuns', () => {
  it('returns 0 and does not enqueue when no RUNNING rows', async () => {
    const prisma = {
      templateRun: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const queue = { add: jest.fn() } as unknown as Queue<TemplateRunPayload>;

    const n = await reconcileRunningTemplateRuns(prisma, queue, silentLogger);

    expect(n).toBe(0);
    expect(queue.add).not.toHaveBeenCalled();
    expect((prisma.templateRun.findMany as jest.Mock).mock.calls[0][0]).toEqual(
      expect.objectContaining({ where: { status: 'RUNNING' } }),
    );
  });

  it('re-enqueues every RUNNING TemplateRun on TEMPLATE_RUNS queue', async () => {
    const prisma = {
      templateRun: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'r1', engagementId: 'e1', templateName: 'recon-passive', currentStepIndex: 1 },
          { id: 'r2', engagementId: 'e2', templateName: 'recon-passive', currentStepIndex: 0 },
        ]),
      },
    } as unknown as PrismaService;
    const queue = { add: jest.fn().mockResolvedValue({}) } as unknown as Queue<TemplateRunPayload>;

    const n = await reconcileRunningTemplateRuns(prisma, queue, silentLogger);

    expect(n).toBe(2);
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenNthCalledWith(1, 'run-template', {
      templateRunId: 'r1',
      engagementId: 'e1',
    });
    expect(queue.add).toHaveBeenNthCalledWith(2, 'run-template', {
      templateRunId: 'r2',
      engagementId: 'e2',
    });
  });

  it('logs a warning but continues when a single re-enqueue fails', async () => {
    const prisma = {
      templateRun: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'r1', engagementId: 'e1', templateName: 'recon-passive', currentStepIndex: 0 },
          { id: 'r2', engagementId: 'e2', templateName: 'recon-passive', currentStepIndex: 0 },
        ]),
      },
    } as unknown as PrismaService;
    const warn = jest.fn();
    const queue = {
      add: jest.fn().mockRejectedValueOnce(new Error('redis down')).mockResolvedValueOnce({}),
    } as unknown as Queue<TemplateRunPayload>;

    const n = await reconcileRunningTemplateRuns(prisma, queue, { log: jest.fn(), warn });

    expect(n).toBe(2);
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/Failed to re-enqueue.*r1.*redis down/),
    );
  });
});
