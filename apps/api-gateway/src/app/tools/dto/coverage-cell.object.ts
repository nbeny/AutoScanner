import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class CoverageCellObject {
  @Field() assetType!: string;
  @Field() scannerName!: string;
  @Field(() => Int) observationCount!: number;
  @Field(() => Int) assetCount!: number;
  @Field(() => Date, { nullable: true }) lastObservedAt?: Date | null;
}
