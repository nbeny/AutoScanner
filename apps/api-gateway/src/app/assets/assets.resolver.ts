import { UseGuards } from '@nestjs/common';
import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import type { User } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AssetObject } from './dto/asset.object';
import { AssetsService } from './assets.service';

@Resolver(() => AssetObject)
@UseGuards(JwtAuthGuard)
export class AssetsResolver {
  constructor(private readonly svc: AssetsService) {}

  @Query(() => [AssetObject])
  assets(
    @CurrentUser() user: User,
    @Args('engagementId', { type: () => ID }) engagementId: string,
  ): Promise<AssetObject[]> {
    return this.svc.listForOwner(user.id, engagementId) as Promise<AssetObject[]>;
  }

  @Query(() => AssetObject)
  asset(
    @CurrentUser() user: User,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<AssetObject> {
    return this.svc.getForOwner(user.id, id) as Promise<AssetObject>;
  }
}
