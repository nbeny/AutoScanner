import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('AiRun')
export class AiRunObject {
  @Field(() => ID)
  id!: string;

  @Field()
  target!: string;

  @Field()
  strategy!: string;

  @Field()
  status!: string;

  @Field(() => Int)
  scanCount!: number;

  @Field(() => Int)
  currentDepth!: number;

  @Field()
  degraded!: boolean;

  @Field({ nullable: true })
  auditText?: string;

  @Field({ nullable: true })
  errorMessage?: string;

  @Field()
  createdAt!: Date;

  @Field({ nullable: true })
  startedAt?: Date;

  @Field({ nullable: true })
  completedAt?: Date;
}
