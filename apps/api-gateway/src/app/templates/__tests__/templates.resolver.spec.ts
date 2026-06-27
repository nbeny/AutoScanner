import { ForbiddenException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { PrismaService } from '@autoscanner/database';
import type { TemplateRunPayload } from '@autoscanner/queues';
import { NotFoundError } from '@autoscanner/common';

import { TemplatesService } from '../templates.service';

const userId = 'user_1';
const otherUserId = 'user_other';
const engagementId = 'eng_1';

type PrismaMock = jest.Mocked<PrismaService>;

function buildPrismaMock(): PrismaMock {
  return {
    engagement: {
      findFirst: jest.fn(),
    },
    scopeRule: {
      findMany: jest.fn(),
    },
    scanTemplate: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    templateRun: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    scan: {
      findMany: jest.fn(),
    },
  } as unknown as PrismaMock;
}

function buildQueueMock(): jest.Mocked<Queue<TemplateRunPayload>> {
  return {
    add: jest.fn().mockResolvedValue({ id: 'bull_1' }),
  } as unknown as jest.Mocked<Queue<TemplateRunPayload>>;
}

describe('TemplatesService', () => {
  let prisma: PrismaMock;
  let queue: jest.Mocked<Queue<TemplateRunPayload>>;
  let svc: TemplatesService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    queue = buildQueueMock();
    const capabilities = { has: jest.fn().mockResolvedValue(true) };
    svc = new TemplatesService(prisma, queue, capabilities as any);
  });

  describe('runTemplate', () => {
    const baseTemplate = {
      id: 'tpl_1',
      name: 'recon-passive',
      displayName: 'Passive recon',
      description: null,
      steps: [],
      isSeeded: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    beforeEach(() => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValue({
        id: engagementId,
        ownerId: userId,
      });
      (prisma.scopeRule.findMany as jest.Mock).mockResolvedValue([
        { ruleType: 'INCLUDE', targetType: 'WILDCARD_DOMAIN', value: 'hackerone.com' },
      ]);
      (prisma.scanTemplate.findUnique as jest.Mock).mockResolvedValue(baseTemplate);
      (prisma.templateRun.create as jest.Mock).mockImplementation(async ({ data }) => ({
        id: 'run_1',
        templateId: data.templateId,
        templateName: data.templateName,
        engagementId: data.engagementId,
        target: data.target,
        status: 'PENDING',
        currentStepIndex: 0,
        startedAt: null,
        completedAt: null,
        errorMessage: null,
        createdById: data.createdById,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
    });

    it('creates TemplateRun and enqueues TEMPLATE_RUNS payload (happy path)', async () => {
      const run = await svc.runTemplate(userId, {
        engagementId,
        templateName: 'recon-passive',
        target: 'hackerone.com',
      });

      expect(prisma.templateRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            templateId: 'tpl_1',
            templateName: 'recon-passive',
            engagementId,
            target: 'hackerone.com',
            status: 'PENDING',
            currentStepIndex: 0,
            createdById: userId,
          }),
        }),
      );
      expect(queue.add).toHaveBeenCalledTimes(1);
      expect(queue.add).toHaveBeenCalledWith(
        'template-run',
        expect.objectContaining({ templateRunId: 'run_1', engagementId }),
      );
      expect(run.id).toBe('run_1');
      expect(run.status).toBe('PENDING');
    });

    it('throws NotFoundError when engagement is not owned by the user', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        svc.runTemplate(otherUserId, {
          engagementId,
          templateName: 'recon-passive',
          target: 'hackerone.com',
        }),
      ).rejects.toBeInstanceOf(NotFoundError);

      expect(queue.add).not.toHaveBeenCalled();
      expect(prisma.templateRun.create).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when target is out of scope (no rules)', async () => {
      (prisma.scopeRule.findMany as jest.Mock).mockResolvedValueOnce([]);

      await expect(
        svc.runTemplate(userId, {
          engagementId,
          templateName: 'recon-passive',
          target: 'hackerone.com',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(queue.add).not.toHaveBeenCalled();
      expect(prisma.templateRun.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when ScanTemplate name does not exist', async () => {
      (prisma.scanTemplate.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        svc.runTemplate(userId, {
          engagementId,
          templateName: 'nope',
          target: 'hackerone.com',
        }),
      ).rejects.toBeInstanceOf(NotFoundError);

      expect(queue.add).not.toHaveBeenCalled();
      expect(prisma.templateRun.create).not.toHaveBeenCalled();
    });

    describe('scope rule matching', () => {
      it('DOMAIN matches exact (case-insensitive)', async () => {
        (prisma.scopeRule.findMany as jest.Mock).mockResolvedValueOnce([
          { ruleType: 'INCLUDE', targetType: 'DOMAIN', value: 'Hackerone.COM' },
        ]);

        await expect(
          svc.runTemplate(userId, {
            engagementId,
            templateName: 'recon-passive',
            target: 'hackerone.com',
          }),
        ).resolves.toBeDefined();

        expect(queue.add).toHaveBeenCalledTimes(1);
      });

      it('DOMAIN does NOT match subdomain', async () => {
        (prisma.scopeRule.findMany as jest.Mock).mockResolvedValueOnce([
          { ruleType: 'INCLUDE', targetType: 'DOMAIN', value: 'hackerone.com' },
        ]);

        await expect(
          svc.runTemplate(userId, {
            engagementId,
            templateName: 'recon-passive',
            target: 'api.hackerone.com',
          }),
        ).rejects.toBeInstanceOf(ForbiddenException);

        expect(queue.add).not.toHaveBeenCalled();
      });

      it('WILDCARD_DOMAIN matches root', async () => {
        (prisma.scopeRule.findMany as jest.Mock).mockResolvedValueOnce([
          { ruleType: 'INCLUDE', targetType: 'WILDCARD_DOMAIN', value: 'hackerone.com' },
        ]);

        await expect(
          svc.runTemplate(userId, {
            engagementId,
            templateName: 'recon-passive',
            target: 'hackerone.com',
          }),
        ).resolves.toBeDefined();
      });

      it('WILDCARD_DOMAIN matches subdomain', async () => {
        (prisma.scopeRule.findMany as jest.Mock).mockResolvedValueOnce([
          { ruleType: 'INCLUDE', targetType: 'WILDCARD_DOMAIN', value: 'hackerone.com' },
        ]);

        await expect(
          svc.runTemplate(userId, {
            engagementId,
            templateName: 'recon-passive',
            target: 'api.hackerone.com',
          }),
        ).resolves.toBeDefined();
      });

      it('WILDCARD_DOMAIN does NOT match substring-suffixed sibling', async () => {
        (prisma.scopeRule.findMany as jest.Mock).mockResolvedValueOnce([
          { ruleType: 'INCLUDE', targetType: 'WILDCARD_DOMAIN', value: 'example.com' },
        ]);

        await expect(
          svc.runTemplate(userId, {
            engagementId,
            templateName: 'recon-passive',
            target: 'example.com.attacker.tld',
          }),
        ).rejects.toBeInstanceOf(ForbiddenException);

        expect(queue.add).not.toHaveBeenCalled();
      });

      it('WILDCARD_DOMAIN does NOT match unrelated host containing value', async () => {
        (prisma.scopeRule.findMany as jest.Mock).mockResolvedValueOnce([
          { ruleType: 'INCLUDE', targetType: 'WILDCARD_DOMAIN', value: 'example.com' },
        ]);

        await expect(
          svc.runTemplate(userId, {
            engagementId,
            templateName: 'recon-passive',
            target: 'notexample.com',
          }),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });

      it('non-INCLUDE rule with matching value does NOT grant scope', async () => {
        (prisma.scopeRule.findMany as jest.Mock).mockResolvedValueOnce([
          { ruleType: 'EXCLUDE', targetType: 'WILDCARD_DOMAIN', value: 'hackerone.com' },
        ]);

        await expect(
          svc.runTemplate(userId, {
            engagementId,
            templateName: 'recon-passive',
            target: 'hackerone.com',
          }),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });

      it('non-domain rule types (CIDR/IP/URL) are skipped for domain targets', async () => {
        (prisma.scopeRule.findMany as jest.Mock).mockResolvedValueOnce([
          { ruleType: 'INCLUDE', targetType: 'CIDR', value: '10.0.0.0/24' },
          { ruleType: 'INCLUDE', targetType: 'IP', value: '10.0.0.1' },
          { ruleType: 'INCLUDE', targetType: 'URL', value: 'https://hackerone.com/' },
        ]);

        await expect(
          svc.runTemplate(userId, {
            engagementId,
            templateName: 'recon-passive',
            target: 'hackerone.com',
          }),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });
    });
  });

  describe('templateRun', () => {
    it('returns the run when owned by the user', async () => {
      const row = { id: 'run_1', engagementId, target: 'hackerone.com' };
      (prisma.templateRun.findFirst as jest.Mock).mockResolvedValueOnce(row);

      const found = await svc.templateRun('run_1', userId);

      expect(prisma.templateRun.findFirst).toHaveBeenCalledWith({
        where: { id: 'run_1', engagement: { ownerId: userId, deletedAt: null } },
      });
      expect(found).toEqual(row);
    });

    it('throws NotFoundError when not found / not owned', async () => {
      (prisma.templateRun.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await expect(svc.templateRun('run_x', userId)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('templateRuns', () => {
    it('lists runs for an engagement scoped to the owner ordered by createdAt desc', async () => {
      const rows = [{ id: 'run_1' }, { id: 'run_2' }];
      (prisma.templateRun.findMany as jest.Mock).mockResolvedValueOnce(rows);

      const result = await svc.templateRuns(engagementId, userId);

      expect(prisma.templateRun.findMany).toHaveBeenCalledWith({
        where: { engagementId, engagement: { ownerId: userId, deletedAt: null } },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(rows);
    });
  });

  describe('scanTemplates', () => {
    it('returns all scan templates ordered by displayName asc', async () => {
      const rows = [{ id: 'a' }, { id: 'b' }];
      (prisma.scanTemplate.findMany as jest.Mock).mockResolvedValueOnce(rows);

      const result = await svc.scanTemplates();

      expect(prisma.scanTemplate.findMany).toHaveBeenCalledWith({
        orderBy: { displayName: 'asc' },
      });
      expect(result).toEqual(rows);
    });
  });

  describe('scansForRun', () => {
    it('returns scans for a template run ordered by stepIndex asc', async () => {
      const rows = [
        { id: 's1', stepIndex: 0 },
        { id: 's2', stepIndex: 1 },
      ];
      (prisma.scan.findMany as jest.Mock).mockResolvedValueOnce(rows);

      const result = await svc.scansForRun('run_1');

      expect(prisma.scan.findMany).toHaveBeenCalledWith({
        where: { templateRunId: 'run_1' },
        orderBy: { stepIndex: 'asc' },
      });
      expect(result).toEqual(rows);
    });
  });
});
