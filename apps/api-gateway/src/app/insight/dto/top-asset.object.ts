import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { AssetType } from '../../assets/dto/asset-type.enum';

@ObjectType()
export class TopAssetObject {
  @Field(() => ID) id!: string;
  @Field(() => AssetType) kind!: AssetType;
  @Field() canonicalValue!: string;
  @Field() firstSeenAt!: Date;
  @Field() lastSeenAt!: Date;
  @Field(() => Int) findingsCount!: number;
  @Field(() => Int) criticalCount!: number;
  @Field(() => Int) highCount!: number;
}
