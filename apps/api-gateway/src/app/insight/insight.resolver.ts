import { UseGuards } from '@nestjs/common';
import { Args, ID, Int, Query, Resolver } from '@nestjs/graphql';
import type { User } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActivityItemObject } from './dto/activity-item.object';
import { EngagementOverviewObject } from './dto/engagement-overview.object';
import { EngagementSummaryObject } from './dto/engagement-summary.object';
import { GlobalOverviewObject } from './dto/global-overview.object';
import { RecentTemplateRunObject } from './dto/recent-template-run.object';
import { TopAssetObject } from './dto/top-asset.object';
import { TopFindingObject } from './dto/top-finding.object';
import { InsightService } from './insight.service';

@Resolver()
@UseGuards(JwtAuthGuard)
export class InsightResolver {
  constructor(private readonly svc: InsightService) {}

  @Query(() => EngagementOverviewObject)
  engagementOverview(
    @CurrentUser() user: User,
    @Args('engagementId', { type: () => ID }) engagementId: string,
  ): Promise<EngagementOverviewObject> {
    return this.svc.engagementOverview(user.id, engagementId) as Promise<EngagementOverviewObject>;
  }

  @Query(() => [TopFindingObject])
  topFindings(
    @CurrentUser() user: User,
    @Args('engagementId', { type: () => ID }) engagementId: string,
    @Args('limit', { type: () => Int, defaultValue: 10 }) limit: number,
  ): Promise<TopFindingObject[]> {
    return this.svc.topFindings(user.id, engagementId, limit) as Promise<TopFindingObject[]>;
  }

  @Query(() => [TopAssetObject])
  topAssets(
    @CurrentUser() user: User,
    @Args('engagementId', { type: () => ID }) engagementId: string,
    @Args('limit', { type: () => Int, defaultValue: 10 }) limit: number,
  ): Promise<TopAssetObject[]> {
    return this.svc.topAssets(user.id, engagementId, limit) as Promise<TopAssetObject[]>;
  }

  @Query(() => [RecentTemplateRunObject])
  recentTemplateRuns(
    @CurrentUser() user: User,
    @Args('engagementId', { type: () => ID }) engagementId: string,
    @Args('limit', { type: () => Int, defaultValue: 5 }) limit: number,
  ): Promise<RecentTemplateRunObject[]> {
    return this.svc.recentTemplateRuns(user.id, engagementId, limit) as Promise<
      RecentTemplateRunObject[]
    >;
  }

  @Query(() => GlobalOverviewObject)
  globalOverview(@CurrentUser() user: User): Promise<GlobalOverviewObject> {
    return this.svc.globalOverview(user.id) as Promise<GlobalOverviewObject>;
  }

  @Query(() => [ActivityItemObject])
  recentActivity(
    @CurrentUser() user: User,
    @Args('limit', { type: () => Int, defaultValue: 15 }) limit: number,
  ): Promise<ActivityItemObject[]> {
    return this.svc.recentActivity(user.id, limit) as Promise<ActivityItemObject[]>;
  }

  @Query(() => [EngagementSummaryObject])
  engagementSummaries(@CurrentUser() user: User): Promise<EngagementSummaryObject[]> {
    return this.svc.engagementSummaries(user.id) as Promise<EngagementSummaryObject[]>;
  }
}
