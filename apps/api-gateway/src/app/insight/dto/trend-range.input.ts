import { Field, InputType, Int } from '@nestjs/graphql';

@InputType()
export class TrendRangeInput {
  @Field(() => Int, { nullable: true }) days?: number;
}
