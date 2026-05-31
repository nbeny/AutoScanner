import { UseGuards } from '@nestjs/common';
import { Args, ID, Int, Query, Resolver } from '@nestjs/graphql';
import type { User } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EngagementOverviewObject } from './dto/engagement-overview.object';
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
}
