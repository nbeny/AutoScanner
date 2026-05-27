import { Field, Float, ID, ObjectType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

import { AssetType } from './dto/asset-type.enum';

/**
 * Single denormalized projection over the `asset_unified_view` SQL view.
 * Mirrors the columns that the view exposes; `attrs` is an opaque JSON
 * payload carrying the side-table fields (Domain / Subdomain / IpAddress)
 * relevant to the row's `kind`.
 */
@ObjectType('UnifiedAsset')
export class UnifiedAssetObject {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  engagementId!: string;

  @Field(() => AssetType)
  kind!: AssetType;

  @Field()
  canonicalValue!: string;

  @Field()
  displayName!: string;

  @Field()
  firstSeenAt!: Date;

  @Field()
  lastSeenAt!: Date;

  @Field(() => Float)
  riskScore!: number;

  @Field(() => GraphQLJSON, { nullable: true })
  attrs?: unknown;
}
