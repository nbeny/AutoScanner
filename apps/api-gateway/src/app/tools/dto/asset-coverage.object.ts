import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class AssetCoverageObject {
  @Field(() => ID) assetId!: string;
  @Field() assetValue!: string;
  @Field() assetType!: string;
  @Field() scannerName!: string;
  @Field(() => Int) observationCount!: number;
  @Field(() => Date, { nullable: true }) lastObservedAt?: Date | null;
}
