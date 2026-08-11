import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class ToolActivityObject {
  @Field() scannerName!: string;
  @Field(() => Int) totalExecutions!: number;
  @Field(() => Int) successCount!: number;
  @Field(() => Int) failureCount!: number;
  @Field(() => Int, { nullable: true }) medianDurationMs?: number | null;
  @Field(() => Date, { nullable: true }) lastRunAt?: Date | null;
}
