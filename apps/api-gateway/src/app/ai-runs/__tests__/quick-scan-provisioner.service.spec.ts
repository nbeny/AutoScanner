import type { PrismaService } from '@autoscanner/database';
import { ALL_CAPABILITIES } from '@autoscanner/auth';

import { QuickScanProvisioner } from '../quick-scan-provisioner.service';

describe('QuickScanProvisioner', () => {
  let prisma: jest.Mocked<PrismaService>;
  let capabilities: { has: jest.Mock; grant: jest.Mock };
  let svc: QuickScanProvisioner;

  const userId = 'user_1';

  beforeEach(() => {
    prisma = {
      engagement: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      scopeRule: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaService>;

    capabilities = {
      has: jest.fn().mockResolvedValue(false),
      grant: jest.fn().mockResolvedValue(undefined),
    };

    svc = new QuickScanProvisioner(prisma, capabilities as never);
  });

  describe('ensureEngagement', () => {
    it('returns the existing engagement when one is found', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'eng_existing' });

      const result = await svc.ensureEngagement(userId);

      expect(result).toEqual({ id: 'eng_existing' });
      expect(prisma.engagement.findFirst).toHaveBeenCalledWith({
        where: { ownerId: userId, name: 'Quick Scans', deletedAt: null },
        select: { id: true },
      });
      expect(prisma.engagement.create).not.toHaveBeenCalled();
    });

    it('creates a Quick Scans engagement when none exists', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.engagement.create as jest.Mock).mockResolvedValueOnce({ id: 'eng_new' });

      const result = await svc.ensureEngagement(userId);

      expect(result).toEqual({ id: 'eng_new' });
      expect(prisma.engagement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ownerId: userId,
            name: 'Quick Scans',
            clientName: 'AutoHunt',
          }),
        }),
      );
    });
  });

  describe('grantAllCapabilities', () => {
    it('grants only the capabilities the user does not already have', async () => {
      // First cap already granted, second not.
      (capabilities.has as jest.Mock).mockResolvedValueOnce(true).mockResolvedValueOnce(false);

      await svc.grantAllCapabilities(userId);

      expect(capabilities.grant).toHaveBeenCalledTimes(1);
      expect(capabilities.grant).toHaveBeenCalledWith(userId, userId, ALL_CAPABILITIES[1]);
    });

    it('grants nothing when all capabilities are already present', async () => {
      (capabilities.has as jest.Mock).mockResolvedValue(true);

      await svc.grantAllCapabilities(userId);

      expect(capabilities.grant).not.toHaveBeenCalled();
    });
  });

  describe('addTargetToScope', () => {
    it('creates an INCLUDE IP rule for a bare IPv4 address', async () => {
      (prisma.scopeRule.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await svc.addTargetToScope('eng_1', '1.2.3.4');

      expect(prisma.scopeRule.create).toHaveBeenCalledWith({
        data: { engagementId: 'eng_1', ruleType: 'INCLUDE', targetType: 'IP', value: '1.2.3.4' },
      });
    });

    it('creates an INCLUDE CIDR rule for a CIDR target', async () => {
      (prisma.scopeRule.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await svc.addTargetToScope('eng_1', '10.0.0.0/24');

      expect(prisma.scopeRule.create).toHaveBeenCalledWith({
        data: {
          engagementId: 'eng_1',
          ruleType: 'INCLUDE',
          targetType: 'CIDR',
          value: '10.0.0.0/24',
        },
      });
    });

    it('is idempotent when a matching rule already exists', async () => {
      (prisma.scopeRule.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'rule_1' });

      await svc.addTargetToScope('eng_1', '1.2.3.4');

      expect(prisma.scopeRule.create).not.toHaveBeenCalled();
    });
  });
});
