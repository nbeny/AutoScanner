import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class ToolRunObject {
  @Field(() => ID) scanJobId!: string;
  @Field() status!: string;
  @Field(() => Int, { nullable: true }) durationMs?: number | null;
  @Field(() => Int, { nullable: true }) exitCode?: number | null;
  @Field({ nullable: true }) errorMessage?: string | null;
  @Field(() => Date, { nullable: true }) completedAt?: Date | null;
  @Field(() => ID, { nullable: true }) agentId?: string | null;
}

@ObjectType()
export class ToolErrorObject {
  @Field() message!: string;
  @Field(() => Int) count!: number;
}

@ObjectType()
export class ToolAgentStatObject {
  @Field(() => ID) agentId!: string;
  @Field(() => Int) executions!: number;
  @Field(() => Int) successCount!: number;
}

@ObjectType()
export class ToolDetailObject {
  @Field() scannerName!: string;
  @Field(() => [ToolRunObject]) runs!: ToolRunObject[];
  @Field(() => [ToolErrorObject]) recurringErrors!: ToolErrorObject[];
  @Field(() => [ToolAgentStatObject]) agents!: ToolAgentStatObject[];
}
