import type { Queue } from 'bullmq';
import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '@autoscanner/database';
import type { TemplateRunPayload } from '@autoscanner/queues';
import { NotFoundError } from '@autoscanner/common';

import { TemplatesService } from '../templates.service';

describe('TemplatesService.runTemplate', () => {
  let prisma: jest.Mocked<PrismaService>;
  let queue: jest.Mocked<Queue<TemplateRunPayload>>;
  let svc: TemplatesService;

  const userId = 'user_1';
  const engagementId = 'eng_1';
  const target = 'hackerone.com';

  beforeEach(() => {
    prisma = {
      engagement: {
        findFirst: jest.fn().mockResolvedValue({ id: engagementId }),
      },
      scopeRule: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { ruleType: 'INCLUDE', targetType: 'WILDCARD_DOMAIN', value: target },
          ]),
      },
      scanTemplate: {
        findUnique: jest.fn().mockResolvedValue({ id: 'tpl_1', name: 'recon-passive' }),
      },
      templateRun: {
        create: jest.fn(async ({ data }) => ({
          id: 'run_1',
          templateId: data.templateId,
          templateName: data.templateName,
          engagementId: data.engagementId,
          target: data.target,
          status: 'PENDING',
          currentStepIndex: 0,
          createdById: data.createdById,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
        update: jest.fn(async ({ where, data }) => ({ id: where.id, ...data })),
      },
    } as unknown as jest.Mocked<PrismaService>;

    queue = { add: jest.fn().mockResolvedValue({ id: 'bull_1' }) } as unknown as jest.Mocked<
      Queue<TemplateRunPayload>
    >;

    svc = new TemplatesService(prisma, queue);
  });

  it('creates a PENDING TemplateRun and enqueues the payload for an in-scope target', async () => {
    const run = await svc.runTemplate(userId, {
      engagementId,
      templateName: 'recon-passive',
      target,
    });

    expect(run.status).toBe('PENDING');
    expect(prisma.templateRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          templateId: 'tpl_1',
          templateName: 'recon-passive',
          target,
          createdById: userId,
        }),
      }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      'template-run',
      expect.objectContaining({ templateRunId: 'run_1', engagementId }),
    );
    expect(prisma.templateRun.update).not.toHaveBeenCalled();
  });

  it('rejects an out-of-scope target with ForbiddenException', async () => {
    await expect(
      svc.runTemplate(userId, {
        engagementId,
        templateName: 'recon-passive',
        target: 'example.org',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.templateRun.create).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the engagement is not owned', async () => {
    (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce(null);
    await expect(
      svc.runTemplate(userId, { engagementId, templateName: 'recon-passive', target }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('marks the TemplateRun FAILED when the BullMQ enqueue throws and re-throws the error', async () => {
    const err = new Error('redis is down');
    (queue.add as jest.Mock).mockRejectedValueOnce(err);

    await expect(
      svc.runTemplate(userId, { engagementId, templateName: 'recon-passive', target }),
    ).rejects.toBe(err);

    expect(prisma.templateRun.update).toHaveBeenCalledWith({
      where: { id: 'run_1' },
      data: { status: 'FAILED', errorMessage: 'enqueue failed: redis is down' },
    });
  });

  it('still re-throws the enqueue error even if the FAILED status update itself fails', async () => {
    (queue.add as jest.Mock).mockRejectedValueOnce(new Error('redis is down'));
    (prisma.templateRun.update as jest.Mock).mockRejectedValueOnce(new Error('db is down'));

    await expect(
      svc.runTemplate(userId, { engagementId, templateName: 'recon-passive', target }),
    ).rejects.toThrow(/redis is down/);
  });
});
