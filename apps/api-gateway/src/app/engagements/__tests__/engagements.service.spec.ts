import { NotFoundError } from '@autoscanner/common';
import type { PrismaService } from '@autoscanner/database';

import { EngagementsService } from '../engagements.service';

const userId = 'user_1';
const otherUserId = 'user_other';
const engagementId = 'eng_1';

type PrismaMock = jest.Mocked<PrismaService>;

function buildPrismaMock(): PrismaMock {
  return {
    engagement: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    scopeRule: {
      create: jest.fn(),
    },
  } as unknown as PrismaMock;
}

describe('EngagementsService', () => {
  let prisma: PrismaMock;
  let svc: EngagementsService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    svc = new EngagementsService(prisma);
  });

  describe('createScopeRule', () => {
    beforeEach(() => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValue({ id: engagementId });
      (prisma.scopeRule.create as jest.Mock).mockImplementation(async ({ data }) => ({
        id: 'rule_1',
        engagementId: data.engagementId,
        ruleType: data.ruleType,
        targetType: data.targetType,
        value: data.value,
        notes: data.notes ?? null,
        createdAt: new Date(),
      }));
    });

    it('verifies engagement ownership and inserts the rule (happy path)', async () => {
      const result = await svc.createScopeRule(userId, {
        engagementId,
        ruleType: 'INCLUDE',
        targetType: 'WILDCARD_DOMAIN',
        value: 'hackerone.com',
      });

      expect(prisma.engagement.findFirst).toHaveBeenCalledWith({
        where: { id: engagementId, ownerId: userId, deletedAt: null },
        select: { id: true },
      });
      expect(prisma.scopeRule.create).toHaveBeenCalledWith({
        data: {
          engagementId,
          ruleType: 'INCLUDE',
          targetType: 'WILDCARD_DOMAIN',
          value: 'hackerone.com',
          notes: null,
        },
      });
      expect(result.id).toBe('rule_1');
      expect(result.ruleType).toBe('INCLUDE');
      expect(result.targetType).toBe('WILDCARD_DOMAIN');
      expect(result.value).toBe('hackerone.com');
    });

    it('forwards the notes field when provided', async () => {
      await svc.createScopeRule(userId, {
        engagementId,
        ruleType: 'EXCLUDE',
        targetType: 'DOMAIN',
        value: 'admin.hackerone.com',
        notes: 'production admin panel',
      });

      expect(prisma.scopeRule.create).toHaveBeenCalledWith({
        data: {
          engagementId,
          ruleType: 'EXCLUDE',
          targetType: 'DOMAIN',
          value: 'admin.hackerone.com',
          notes: 'production admin panel',
        },
      });
    });

    it('throws NotFoundError when engagement is not owned by the user', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        svc.createScopeRule(otherUserId, {
          engagementId,
          ruleType: 'INCLUDE',
          targetType: 'WILDCARD_DOMAIN',
          value: 'hackerone.com',
        }),
      ).rejects.toBeInstanceOf(NotFoundError);

      expect(prisma.scopeRule.create).not.toHaveBeenCalled();
    });
  });
});
