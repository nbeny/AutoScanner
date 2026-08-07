import { UseGuards } from '@nestjs/common';
import { Args, ID, Int, Query, Resolver } from '@nestjs/graphql';
import type { User } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AssetCoverageObject } from './dto/asset-coverage.object';
import { CoverageCellObject } from './dto/coverage-cell.object';
import { KaliToolDetailObject, KaliToolSummaryObject } from './dto/kali-tool.object';
import { ScannerCatalogEntryObject } from './dto/scanner-catalog.object';
import { ToolActivityObject } from './dto/tool-activity.object';
import { ToolDetailObject } from './dto/tool-detail.object';
import { KaliCatalogService } from './kali-catalog.service';
import { ScannerCatalogService } from './scanner-catalog.service';
import { ToolsService } from './tools.service';

@Resolver()
@UseGuards(JwtAuthGuard)
export class ToolsResolver {
  constructor(
    private readonly svc: ToolsService,
    private readonly catalog: ScannerCatalogService,
    private readonly kali: KaliCatalogService,
  ) {}

  @Query(() => [ScannerCatalogEntryObject])
  scannerCatalog(): ScannerCatalogEntryObject[] {
    return this.catalog.catalog();
  }

  @Query(() => [KaliToolSummaryObject])
  kaliTools(): KaliToolSummaryObject[] {
    return this.kali.list();
  }

  @Query(() => KaliToolDetailObject, { nullable: true })
  kaliTool(@Args('binary') binary: string): KaliToolDetailObject | null {
    return this.kali.detail(binary);
  }

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

  @Query(() => ToolDetailObject)
  toolDetail(
    @CurrentUser() user: User,
    @Args('scannerName') scannerName: string,
    @Args('engagementId', { type: () => ID, nullable: true }) engagementId?: string,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ): Promise<ToolDetailObject> {
    return this.svc.toolDetail(user.id, { engagementId }, scannerName, limit ?? 50);
  }
}
