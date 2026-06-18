import { Field, Int, ObjectType } from '@nestjs/graphql';
import { EngagementsByStatusObject } from './engagements-by-status.object';
import { SeverityCountsObject } from './severity-counts.object';

@ObjectType()
export class GlobalOverviewObject {
  @Field(() => EngagementsByStatusObject) engagementsByStatus!: EngagementsByStatusObject;
  @Field(() => Int) domains!: number;
  @Field(() => Int) subdomains!: number;
  @Field(() => Int) ipAddresses!: number;
  @Field(() => Int) openPorts!: number;
  @Field(() => Int) uniqueTechs!: number;
  @Field(() => SeverityCountsObject) findingsBySeverity!: SeverityCountsObject;
  @Field(() => Int) activeSchedules!: number;
  @Field(() => Int) runningScans!: number;
}
