import type { PrismaService } from '@autoscanner/database';

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
    const bus = { publish: jest.fn().mockResolvedValue(undefined) };

    const n = await reconcileRunningTemplateRuns(prisma, bus, silentLogger);

    expect(n).toBe(0);
    expect(bus.publish).not.toHaveBeenCalled();
    expect((prisma.templateRun.findMany as jest.Mock).mock.calls[0][0]).toEqual(
      expect.objectContaining({ where: { status: 'RUNNING' } }),
    );
  });

  it('re-enqueues every RUNNING TemplateRun on TEMPLATE_RUNS bus', async () => {
    const prisma = {
      templateRun: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'r1', engagementId: 'e1', templateName: 'recon-passive', currentStepIndex: 1 },
          { id: 'r2', engagementId: 'e2', templateName: 'recon-passive', currentStepIndex: 0 },
        ]),
      },
    } as unknown as PrismaService;
    const bus = { publish: jest.fn().mockResolvedValue(undefined) };

    const n = await reconcileRunningTemplateRuns(prisma, bus, silentLogger);

    expect(n).toBe(2);
    expect(bus.publish).toHaveBeenCalledTimes(2);
    expect(bus.publish).toHaveBeenNthCalledWith(1, 'security.scan.requested', expect.any(String), {
      templateRunId: 'r1',
      engagementId: 'e1',
    });
    expect(bus.publish).toHaveBeenNthCalledWith(2, 'security.scan.requested', expect.any(String), {
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
    const bus = {
      publish: jest
        .fn()
        .mockRejectedValueOnce(new Error('redis down'))
        .mockResolvedValueOnce(undefined),
    };

    const n = await reconcileRunningTemplateRuns(prisma, bus, { log: jest.fn(), warn });

    expect(n).toBe(2);
    expect(bus.publish).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/Failed to re-enqueue.*r1.*redis down/),
    );
  });
});
