import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class CoverageSummaryObject {
  @Field(() => Int) totalAssets!: number;
  @Field(() => Int) scannedAssets!: number;
  @Field(() => Float) percent!: number;
}
