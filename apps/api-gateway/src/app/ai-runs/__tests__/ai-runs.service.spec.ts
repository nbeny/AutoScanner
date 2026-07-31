import type { PrismaService } from '@autoscanner/database';
import { ValidationError } from '@autoscanner/common';

import { AiRunsService } from '../ai-runs.service';
import type { QuickScanProvisioner } from '../quick-scan-provisioner.service';

describe('AiRunsService.runAiScan', () => {
  let prisma: jest.Mocked<PrismaService>;
  let bus: { publish: jest.Mock };
  let provisioner: jest.Mocked<QuickScanProvisioner>;
  let svc: AiRunsService;

  const userId = 'user_1';
  const engagementId = 'eng_quick';

  beforeEach(() => {
    prisma = {
      aiRun: {
        create: jest.fn(async ({ data }) => ({
          id: 'airun_1',
          engagementId: data.engagementId,
          createdById: data.createdById,
          target: data.target,
          strategy: data.strategy,
          status: data.status,
          guardrails: data.guardrails,
          scanCount: 0,
          currentDepth: 0,
          degraded: false,
          createdAt: new Date(),
        })),
        update: jest.fn(async ({ where, data }) => ({ id: where.id, ...data })),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      aiRunNode: { findMany: jest.fn() },
      aiDecision: { findMany: jest.fn() },
    } as unknown as jest.Mocked<PrismaService>;

    bus = { publish: jest.fn().mockResolvedValue(undefined) };

    provisioner = {
      ensureEngagement: jest.fn().mockResolvedValue({ id: engagementId }),
      grantAllCapabilities: jest.fn().mockResolvedValue(undefined),
      addTargetToScope: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<QuickScanProvisioner>;

    svc = new AiRunsService(prisma, bus, provisioner);
  });

  it('creates a PENDING SINGLE_HOST AiRun, provisions, and enqueues for a bare IPv4', async () => {
    const run = await svc.runAiScan(userId, { target: '1.2.3.4' });

    expect(provisioner.ensureEngagement).toHaveBeenCalledWith(userId);
    expect(provisioner.grantAllCapabilities).toHaveBeenCalledWith(userId);
    expect(provisioner.addTargetToScope).toHaveBeenCalledWith(engagementId, '1.2.3.4');

    expect(prisma.aiRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          engagementId,
          createdById: userId,
          target: '1.2.3.4',
          strategy: 'SINGLE_HOST',
          status: 'PENDING',
        }),
      }),
    );
    expect(bus.publish).toHaveBeenCalledWith('security.ai.run.requested', expect.any(String), {
      aiRunId: 'airun_1',
      engagementId,
    });
    expect(run.id).toBe('airun_1');
  });

  it('uses RANGE_PER_HOST strategy for a CIDR target', async () => {
    await svc.runAiScan(userId, { target: '10.0.0.0/24' });

    expect(prisma.aiRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ strategy: 'RANGE_PER_HOST' }),
      }),
    );
  });

  it('throws ValidationError and does not create or enqueue for an invalid target', async () => {
    await expect(svc.runAiScan(userId, { target: 'garbage' })).rejects.toBeInstanceOf(
      ValidationError,
    );

    expect(prisma.aiRun.create).not.toHaveBeenCalled();
    expect(bus.publish).not.toHaveBeenCalled();
    expect(provisioner.ensureEngagement).not.toHaveBeenCalled();
  });

  it('reconciles the AiRun to FAILED and rethrows when the enqueue rejects', async () => {
    const enqueueError = new Error('redis is down');
    (bus.publish as jest.Mock).mockRejectedValueOnce(enqueueError);

    await expect(svc.runAiScan(userId, { target: '1.2.3.4' })).rejects.toBe(enqueueError);

    expect(prisma.aiRun.update).toHaveBeenCalledWith({
      where: { id: 'airun_1' },
      data: { status: 'FAILED', errorMessage: 'enqueue failed: redis is down' },
    });
  });
});
