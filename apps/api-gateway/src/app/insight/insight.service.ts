import { Injectable } from '@nestjs/common';
import { NotFoundError } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';
import {
  type ActivityItem,
  type CoverageSummary,
  type EngagementOverview,
  type EngagementSummary,
  type GlobalOverview,
  type RecentTemplateRun,
  type SeverityTrendBucket,
  type TopAsset,
  type TopFinding,
  getCoverageSummary,
  getEngagementOverview,
  getEngagementSummaries,
  getGlobalOverview,
  getRecentActivity,
  getRecentTemplateRuns,
  getSeverityTrend,
  getTopAssets,
  getTopFindings,
} from '@autoscanner/insight';
import type { TrendRangeInput } from './dto/trend-range.input';

function clamp(n: number | null | undefined, min: number, max: number, fallback: number): number {
  const v = Number.isFinite(n) ? Math.trunc(n as number) : fallback;
  return Math.min(Math.max(v, min), max);
}

@Injectable()
export class InsightService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertOwnership(userId: string, engagementId: string): Promise<void> {
    const eng = await this.prisma.engagement.findFirst({
      where: { id: engagementId, ownerId: userId, deletedAt: null },
      select: { id: true },
    });
    if (!eng) throw new NotFoundError('Engagement', engagementId);
  }

  async engagementOverview(userId: string, engagementId: string): Promise<EngagementOverview> {
    await this.assertOwnership(userId, engagementId);
    return getEngagementOverview(this.prisma, engagementId);
  }

  async topFindings(userId: string, engagementId: string, limit: number): Promise<TopFinding[]> {
    await this.assertOwnership(userId, engagementId);
    return getTopFindings(this.prisma, engagementId, clamp(limit, 1, 100, 10));
  }

  async topAssets(userId: string, engagementId: string, limit: number): Promise<TopAsset[]> {
    await this.assertOwnership(userId, engagementId);
    return getTopAssets(this.prisma, engagementId, clamp(limit, 1, 100, 10));
  }

  async recentTemplateRuns(
    userId: string,
    engagementId: string,
    limit: number,
  ): Promise<RecentTemplateRun[]> {
    await this.assertOwnership(userId, engagementId);
    return getRecentTemplateRuns(this.prisma, engagementId, clamp(limit, 1, 20, 5));
  }

  // Cross-engagement queries. These are inherently owner-scoped by the lib
  // functions (they filter on ownerId), so no per-engagement ownership check
  // is needed.

  globalOverview(userId: string): Promise<GlobalOverview> {
    return getGlobalOverview(this.prisma, userId);
  }

  recentActivity(userId: string, limit: number): Promise<ActivityItem[]> {
    return getRecentActivity(this.prisma, userId, clamp(limit, 1, 50, 15));
  }

  engagementSummaries(userId: string): Promise<EngagementSummary[]> {
    return getEngagementSummaries(this.prisma, userId);
  }

  async severityTrend(
    userId: string,
    engagementId?: string,
    range?: TrendRangeInput,
  ): Promise<SeverityTrendBucket[]> {
    if (engagementId) await this.assertOwnership(userId, engagementId);
    return getSeverityTrend(this.prisma, userId, engagementId, range?.days ?? 30);
  }

  async coverageSummary(userId: string, engagementId?: string): Promise<CoverageSummary> {
    if (engagementId) await this.assertOwnership(userId, engagementId);
    return getCoverageSummary(this.prisma, userId, engagementId);
  }
}
