import { Field, Int, ObjectType } from '@nestjs/graphql';

import { SeverityCountsObject } from '../../insight/dto/severity-counts.object';

@ObjectType()
export class ToolActivityObject {
  @Field() scannerName!: string;
  @Field(() => Int) totalExecutions!: number;
  @Field(() => Int) successCount!: number;
  @Field(() => Int) failureCount!: number;
  @Field(() => Int, { nullable: true }) medianDurationMs?: number | null;
  @Field(() => SeverityCountsObject) findingsBySeverity!: SeverityCountsObject;
  @Field(() => Date, { nullable: true }) lastRunAt?: Date | null;
  @Field(() => Int) totalFindings!: number;
}
