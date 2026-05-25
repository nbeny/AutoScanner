import { Field, Float, ID, ObjectType } from '@nestjs/graphql';
import { AssetType } from './asset-type.enum';
import { PortObject } from './port.object';

@ObjectType('Asset')
export class AssetObject {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  engagementId!: string;

  @Field(() => AssetType)
  type!: AssetType;

  @Field()
  value!: string;

  @Field()
  canonicalValue!: string;

  @Field()
  firstSeenAt!: Date;

  @Field()
  lastSeenAt!: Date;

  @Field(() => Float)
  riskScore!: number;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;

  @Field(() => [PortObject], { nullable: 'items' })
  ports?: PortObject[];
}
