import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('QueueHealth')
export class QueueHealthObject {
  @Field()
  name!: string;

  @Field(() => Int)
  waiting!: number;

  @Field(() => Int)
  active!: number;

  @Field(() => Int)
  completed!: number;

  @Field(() => Int)
  failed!: number;

  @Field(() => Int)
  delayed!: number;

  @Field(() => Int)
  workers!: number;
}
