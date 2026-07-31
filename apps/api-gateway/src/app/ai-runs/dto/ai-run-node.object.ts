import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('AiRunNode')
export class AiRunNodeObject {
  @Field(() => ID)
  id!: string;

  @Field({ nullable: true })
  parentNodeId?: string;

  @Field({ nullable: true })
  scanId?: string;

  @Field()
  scannerName!: string;

  @Field()
  target!: string;

  @Field(() => Int)
  depth!: number;

  @Field({ nullable: true })
  rationale?: string;

  @Field()
  status!: string;

  @Field()
  createdAt!: Date;

  @Field({ nullable: true })
  stepId?: string;

  @Field({ nullable: true })
  skipReason?: string;
}
