import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class EngagementsByStatusObject {
  @Field(() => Int) draft!: number;
  @Field(() => Int) active!: number;
  @Field(() => Int) paused!: number;
  @Field(() => Int) completed!: number;
  @Field(() => Int) archived!: number;
  @Field(() => Int) total!: number;
}
