import { UseGuards } from '@nestjs/common';
import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import type { User } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AssetCoverageObject } from './dto/asset-coverage.object';
import { CoverageCellObject } from './dto/coverage-cell.object';
import { ToolActivityObject } from './dto/tool-activity.object';
import { ToolsService } from './tools.service';

@Resolver()
@UseGuards(JwtAuthGuard)
export class ToolsResolver {
  constructor(private readonly svc: ToolsService) {}

  @Query(() => [ToolActivityObject])
  toolActivity(
    @CurrentUser() user: User,
    @Args('engagementId', { type: () => ID, nullable: true }) engagementId?: string,
  ): Promise<ToolActivityObject[]> {
    return this.svc.toolActivity(user.id, { engagementId });
  }

  @Query(() => [CoverageCellObject])
  coverageMatrix(
    @CurrentUser() user: User,
    @Args('engagementId', { type: () => ID, nullable: true }) engagementId?: string,
  ): Promise<CoverageCellObject[]> {
    return this.svc.coverageMatrix(user.id, { engagementId });
  }

  @Query(() => [AssetCoverageObject])
  assetCoverage(
    @CurrentUser() user: User,
    @Args('engagementId', { type: () => ID, nullable: true }) engagementId?: string,
    @Args('assetType', { nullable: true }) assetType?: string,
  ): Promise<AssetCoverageObject[]> {
    return this.svc.assetCoverage(user.id, { engagementId }, assetType);
  }
}
