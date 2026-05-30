import { UseGuards } from '@nestjs/common';
import { Args, ID, Info, Query, Resolver } from '@nestjs/graphql';
import type { User } from '@prisma/client';
import type { GraphQLResolveInfo } from 'graphql';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AssetType } from './dto/asset-type.enum';
import { AssetObject } from './dto/asset.object';
import { AssetsService } from './assets.service';

/**
 * Inspect the GraphQL resolve info for the names of the fields the client
 * selected directly under the current field. Used to skip Prisma joins for
 * relations the client didn't ask for. Inline fragments and fragment
 * spreads are ignored here — Phase 2 frontend queries select fields
 * directly, no fragments. Revisit if a fragment-using consumer appears.
 */
function selectedFieldNames(info: GraphQLResolveInfo): Set<string> {
  const names = new Set<string>();
  for (const node of info.fieldNodes) {
    for (const sel of node.selectionSet?.selections ?? []) {
      if (sel.kind === 'Field') names.add(sel.name.value);
    }
  }
  return names;
}

@Resolver(() => AssetObject)
@UseGuards(JwtAuthGuard)
export class AssetsResolver {
  constructor(private readonly svc: AssetsService) {}

  @Query(() => [AssetObject])
  assets(
    @CurrentUser() user: User,
    @Args('engagementId', { type: () => ID }) engagementId: string,
    @Info() info: GraphQLResolveInfo,
    @Args('types', { type: () => [AssetType], nullable: true })
    types?: AssetType[] | null,
  ): Promise<AssetObject[]> {
    const selected = selectedFieldNames(info);
    return this.svc.listForOwner(user.id, engagementId, {
      types: types ?? undefined,
      includePorts: selected.has('ports'),
      includeTechnologies: selected.has('technologies'),
    }) as Promise<AssetObject[]>;
  }

  @Query(() => AssetObject)
  asset(
    @CurrentUser() user: User,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<AssetObject> {
    return this.svc.getForOwner(user.id, id) as Promise<AssetObject>;
  }
}
