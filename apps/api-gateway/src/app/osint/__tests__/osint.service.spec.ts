import { NotFoundError } from '@autoscanner/common';
import type { PrismaService } from '@autoscanner/database';

import { OsintService } from '../osint.service';

describe('OsintService', () => {
  let prisma: jest.Mocked<PrismaService>;
  let svc: OsintService;
  const userId = 'user_1';
  const engagementId = 'eng_1';

  beforeEach(() => {
    prisma = {
      engagement: { findFirst: jest.fn() },
      email: { findMany: jest.fn() },
      orgMetadata: { findMany: jest.fn() },
    } as unknown as jest.Mocked<PrismaService>;
    svc = new OsintService(prisma);
  });

  describe('emails', () => {
    it('throws NotFoundError when the engagement is not owned by the user', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await expect(svc.emails(userId, engagementId)).rejects.toBeInstanceOf(NotFoundError);
      expect(prisma.email.findMany).not.toHaveBeenCalled();
    });

    it('calls email.findMany with engagementId filter and lastSeenAt desc order', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      const fixture = [
        {
          id: 'em_1',
          engagementId,
          address: 'admin@example.com',
          source: 'whois',
          firstSeenAt: new Date('2026-05-01'),
          lastSeenAt: new Date('2026-05-02'),
        },
      ];
      (prisma.email.findMany as jest.Mock).mockResolvedValueOnce(fixture);

      const result = await svc.emails(userId, engagementId);

      expect(prisma.engagement.findFirst).toHaveBeenCalledWith({
        where: { id: engagementId, ownerId: userId, deletedAt: null },
        select: { id: true },
      });
      expect(prisma.email.findMany).toHaveBeenCalledWith({
        where: { engagementId },
        orderBy: { lastSeenAt: 'desc' },
      });
      expect(result).toBe(fixture);
    });
  });

  describe('orgMetadata', () => {
    it('throws NotFoundError when the engagement is not owned by the user', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await expect(svc.orgMetadata(userId, engagementId)).rejects.toBeInstanceOf(NotFoundError);
      expect(prisma.orgMetadata.findMany).not.toHaveBeenCalled();
    });

    it('calls orgMetadata.findMany with engagementId filter and lastSeenAt desc order', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      const fixture = [
        {
          id: 'om_1',
          engagementId,
          kind: 'WHOIS',
          data: { registrant: 'Example Corp' },
          source: 'whois',
          firstSeenAt: new Date('2026-05-01'),
          lastSeenAt: new Date('2026-05-02'),
        },
      ];
      (prisma.orgMetadata.findMany as jest.Mock).mockResolvedValueOnce(fixture);

      const result = await svc.orgMetadata(userId, engagementId);

      expect(prisma.engagement.findFirst).toHaveBeenCalledWith({
        where: { id: engagementId, ownerId: userId, deletedAt: null },
        select: { id: true },
      });
      expect(prisma.orgMetadata.findMany).toHaveBeenCalledWith({
        where: { engagementId },
        orderBy: { lastSeenAt: 'desc' },
      });
      expect(result).toBe(fixture);
    });
  });
});
