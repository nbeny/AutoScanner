import { NotFoundError } from '@autoscanner/common';
import type { PrismaService } from '@autoscanner/database';

import { InsightService } from '../insight.service';
import * as insightLib from '@autoscanner/insight';

jest.mock('@autoscanner/insight');

describe('InsightService', () => {
  let prisma: jest.Mocked<PrismaService>;
  let svc: InsightService;
  const userId = 'u1';
  const engagementId = 'e1';

  beforeEach(() => {
    jest.resetAllMocks();
    prisma = {
      engagement: { findFirst: jest.fn() },
    } as unknown as jest.Mocked<PrismaService>;
    svc = new InsightService(prisma);
  });

  describe('ownership', () => {
    it('throws NotFoundError on overview when engagement not owned', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce(null);
      await expect(svc.engagementOverview(userId, engagementId)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('throws NotFoundError on topFindings when engagement not owned', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce(null);
      await expect(svc.topFindings(userId, engagementId, 10)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws NotFoundError on topAssets when engagement not owned', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce(null);
      await expect(svc.topAssets(userId, engagementId, 10)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws NotFoundError on recentTemplateRuns when engagement not owned', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce(null);
      await expect(svc.recentTemplateRuns(userId, engagementId, 5)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('checks ownership with ownerId + deletedAt: null', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      (insightLib.getEngagementOverview as jest.Mock).mockResolvedValueOnce({
        domains: 0,
        subdomains: 0,
        ipAddresses: 0,
        openPorts: 0,
        uniqueTechs: 0,
        findingsBySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      });

      await svc.engagementOverview(userId, engagementId);

      expect(prisma.engagement.findFirst).toHaveBeenCalledWith({
        where: { id: engagementId, ownerId: userId, deletedAt: null },
        select: { id: true },
      });
    });
  });

  describe('delegation', () => {
    beforeEach(() => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValue({ id: engagementId });
    });

    it('engagementOverview delegates to the lib with prisma + engagementId', async () => {
      const fake = {
        domains: 1,
        subdomains: 2,
        ipAddresses: 3,
        openPorts: 4,
        uniqueTechs: 5,
        findingsBySeverity: { critical: 1, high: 0, medium: 0, low: 0, info: 0 },
      };
      (insightLib.getEngagementOverview as jest.Mock).mockResolvedValueOnce(fake);

      const result = await svc.engagementOverview(userId, engagementId);

      expect(insightLib.getEngagementOverview).toHaveBeenCalledWith(prisma, engagementId);
      expect(result).toBe(fake);
    });

    it('topFindings clamps limit to [1, 100] (default 10)', async () => {
      (insightLib.getTopFindings as jest.Mock).mockResolvedValue([]);

      await svc.topFindings(userId, engagementId, 200);
      expect(insightLib.getTopFindings).toHaveBeenLastCalledWith(prisma, engagementId, 100);

      await svc.topFindings(userId, engagementId, 0);
      expect(insightLib.getTopFindings).toHaveBeenLastCalledWith(prisma, engagementId, 1);

      await svc.topFindings(userId, engagementId, -5);
      expect(insightLib.getTopFindings).toHaveBeenLastCalledWith(prisma, engagementId, 1);

      await svc.topFindings(userId, engagementId, 7);
      expect(insightLib.getTopFindings).toHaveBeenLastCalledWith(prisma, engagementId, 7);
    });

    it('topAssets delegates with clamped limit', async () => {
      (insightLib.getTopAssets as jest.Mock).mockResolvedValue([]);
      await svc.topAssets(userId, engagementId, 999);
      expect(insightLib.getTopAssets).toHaveBeenLastCalledWith(prisma, engagementId, 100);
    });

    it('recentTemplateRuns delegates with clamped limit (max 20)', async () => {
      (insightLib.getRecentTemplateRuns as jest.Mock).mockResolvedValue([]);
      await svc.recentTemplateRuns(userId, engagementId, 999);
      expect(insightLib.getRecentTemplateRuns).toHaveBeenLastCalledWith(prisma, engagementId, 20);
    });
  });

  describe('severityTrend', () => {
    const fakeBuckets = [
      { bucketDate: '2026-01-01', counts: { critical: 1, high: 0, medium: 0, low: 0, info: 0 } },
    ];

    it('delegates to getSeverityTrend with prisma + userId + engagementId + days', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      (insightLib.getSeverityTrend as jest.Mock).mockResolvedValueOnce(fakeBuckets);

      const result = await svc.severityTrend(userId, engagementId, { days: 14 });

      expect(insightLib.getSeverityTrend).toHaveBeenCalledWith(prisma, userId, engagementId, 14);
      expect(result).toBe(fakeBuckets);
    });

    it('checks ownership when engagementId is provided', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      (insightLib.getSeverityTrend as jest.Mock).mockResolvedValueOnce([]);

      await svc.severityTrend(userId, engagementId);

      expect(prisma.engagement.findFirst).toHaveBeenCalledWith({
        where: { id: engagementId, ownerId: userId, deletedAt: null },
        select: { id: true },
      });
    });

    it('throws NotFoundError on severityTrend when engagement not owned', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce(null);
      await expect(svc.severityTrend(userId, engagementId)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('skips ownership check when engagementId is omitted, uses default 30 days', async () => {
      (insightLib.getSeverityTrend as jest.Mock).mockResolvedValueOnce(fakeBuckets);

      const result = await svc.severityTrend(userId);

      expect(prisma.engagement.findFirst).not.toHaveBeenCalled();
      expect(insightLib.getSeverityTrend).toHaveBeenCalledWith(prisma, userId, undefined, 30);
      expect(result).toBe(fakeBuckets);
    });
  });

  describe('cross-engagement queries', () => {
    it('globalOverview delegates with prisma + userId, no ownership check', async () => {
      const fake = { engagementsByStatus: { total: 0 } };
      (insightLib.getGlobalOverview as jest.Mock).mockResolvedValueOnce(fake);

      const result = await svc.globalOverview(userId);

      expect(insightLib.getGlobalOverview).toHaveBeenCalledWith(prisma, userId);
      expect(prisma.engagement.findFirst).not.toHaveBeenCalled();
      expect(result).toBe(fake);
    });

    it('recentActivity delegates with clamped limit (max 50, default 15)', async () => {
      (insightLib.getRecentActivity as jest.Mock).mockResolvedValue([]);

      await svc.recentActivity(userId, 999);
      expect(insightLib.getRecentActivity).toHaveBeenLastCalledWith(prisma, userId, 50);

      await svc.recentActivity(userId, 0);
      expect(insightLib.getRecentActivity).toHaveBeenLastCalledWith(prisma, userId, 1);
    });

    it('engagementSummaries delegates with prisma + userId', async () => {
      (insightLib.getEngagementSummaries as jest.Mock).mockResolvedValue([]);
      await svc.engagementSummaries(userId);
      expect(insightLib.getEngagementSummaries).toHaveBeenCalledWith(prisma, userId);
    });
  });
});
