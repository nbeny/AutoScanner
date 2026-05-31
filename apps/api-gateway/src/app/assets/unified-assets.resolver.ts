import { UseGuards } from '@nestjs/common';
import { Args, ID, Int, Query, Resolver } from '@nestjs/graphql';
import type { User } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AssetFilters } from './dto/asset-filters.input';
import { AssetSort } from './dto/asset-sort.enum';
import { AssetType } from './dto/asset-type.enum';
import { UnifiedAssetObject } from './unified-asset.dto';
import { UnifiedAssetsService } from './unified-assets.service';

/**
 * Cross-kind asset listing backed by the `asset_unified_view` SQL view.
 *
 * This resolver intentionally exposes `unifiedAssets`, NOT `assets`, to avoid
 * a breaking change to the Phase-1/2 frontend which still consumes the typed
 * `assets(engagementId)` query (with nested `ports` + `technologies`). The two
 * APIs coexist; eventually the typed resolver may move to a separate Asset
 * detail/per-kind endpoint.
 */
@Resolver(() => UnifiedAssetObject)
@UseGuards(JwtAuthGuard)
export class UnifiedAssetsResolver {
  constructor(private readonly svc: UnifiedAssetsService) {}

  @Query(() => [UnifiedAssetObject])
  unifiedAssets(
    @CurrentUser() user: User,
    @Args('engagementId', { type: () => ID }) engagementId: string,
    @Args('kinds', { type: () => [AssetType], nullable: true })
    kinds?: AssetType[] | null,
    @Args('search', { type: () => String, nullable: true })
    search?: string | null,
    @Args('limit', { type: () => Int, defaultValue: 100 }) limit?: number,
    @Args('offset', { type: () => Int, defaultValue: 0 }) offset?: number,
    @Args('filters', { type: () => AssetFilters, nullable: true })
    filters?: AssetFilters | null,
    @Args('sort', { type: () => AssetSort, nullable: true })
    sort?: AssetSort | null,
  ): Promise<UnifiedAssetObject[]> {
    return this.svc.list(user.id, engagementId, { kinds, search, limit, offset, filters, sort });
  }
}
