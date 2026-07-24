import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('AiDecision')
export class AiDecisionObject {
  @Field(() => ID)
  id!: string;

  @Field(() => Int)
  round!: number;

  @Field()
  degraded!: boolean;

  @Field()
  createdAt!: Date;
}
