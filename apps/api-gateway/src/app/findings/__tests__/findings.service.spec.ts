import { NotFoundError } from '@autoscanner/common';
import type { PrismaService } from '@autoscanner/database';
import { Severity } from '@prisma/client';

import { FindingsService } from '../findings.service';

describe('FindingsService', () => {
  let prisma: jest.Mocked<PrismaService>;
  let svc: FindingsService;
  const userId = 'user_1';
  const engagementId = 'eng_1';

  beforeEach(() => {
    prisma = {
      engagement: { findFirst: jest.fn() },
      finding: { findMany: jest.fn() },
    } as unknown as jest.Mocked<PrismaService>;
    svc = new FindingsService(prisma);
  });

  describe('listForOwner', () => {
    it('returns the findings for the engagement ordered by severity desc then lastSeenAt desc', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      const fixture = [
        {
          id: 'f_1',
          assetId: 'a_1',
          scanJobId: 'job_1',
          title: 'CVE',
          severity: 'CRITICAL',
          location: '/x',
          cveId: 'CVE-1',
          templateId: 'tpl-1',
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
        },
      ];
      (prisma.finding.findMany as jest.Mock).mockResolvedValueOnce(fixture);

      const result = await svc.listForOwner(userId, engagementId);

      expect(prisma.engagement.findFirst).toHaveBeenCalledWith({
        where: { id: engagementId, ownerId: userId, deletedAt: null },
        select: { id: true },
      });
      expect(prisma.finding.findMany).toHaveBeenCalledWith({
        where: { asset: { engagementId } },
        orderBy: [{ severity: 'desc' }, { lastSeenAt: 'desc' }],
      });
      expect(result).toBe(fixture);
    });

    it('passes the severity filter through to prisma when provided', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      (prisma.finding.findMany as jest.Mock).mockResolvedValueOnce([]);

      await svc.listForOwner(userId, engagementId, [Severity.HIGH, Severity.CRITICAL]);

      expect(prisma.finding.findMany).toHaveBeenCalledWith({
        where: {
          asset: { engagementId },
          severity: { in: [Severity.HIGH, Severity.CRITICAL] },
        },
        orderBy: [{ severity: 'desc' }, { lastSeenAt: 'desc' }],
      });
    });

    it('does not apply the severity filter when an empty array is passed', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      (prisma.finding.findMany as jest.Mock).mockResolvedValueOnce([]);

      await svc.listForOwner(userId, engagementId, []);

      expect(prisma.finding.findMany).toHaveBeenCalledWith({
        where: { asset: { engagementId } },
        orderBy: [{ severity: 'desc' }, { lastSeenAt: 'desc' }],
      });
    });

    it('throws NotFoundError when the engagement is not owned by the user', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await expect(svc.listForOwner(userId, engagementId)).rejects.toBeInstanceOf(NotFoundError);
      expect(prisma.finding.findMany).not.toHaveBeenCalled();
    });
  });
});
