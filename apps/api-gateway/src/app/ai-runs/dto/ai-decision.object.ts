import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('AiDecision')
export class AiDecisionObject {
  @Field(() => ID)
  id!: string;

  @Field(() => Int)
  round!: number;

  @Field()
  degraded!: boolean;

  /** Which fleet agent produced this decision (SP4c): 'planner' | 'chain'. */
  @Field({ nullable: true })
  agentRole?: string;

  @Field()
  createdAt!: Date;
}
