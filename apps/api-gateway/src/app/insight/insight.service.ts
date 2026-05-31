import { Injectable } from '@nestjs/common';
import { NotFoundError } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';
import {
  type EngagementOverview,
  type RecentTemplateRun,
  type TopAsset,
  type TopFinding,
  getEngagementOverview,
  getRecentTemplateRuns,
  getTopAssets,
  getTopFindings,
} from '@autoscanner/insight';

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
}
