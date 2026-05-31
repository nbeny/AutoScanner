import { Field, Int, ObjectType } from '@nestjs/graphql';
import { SeverityCountsObject } from './severity-counts.object';

@ObjectType()
export class EngagementOverviewObject {
  @Field(() => Int) domains!: number;
  @Field(() => Int) subdomains!: number;
  @Field(() => Int) ipAddresses!: number;
  @Field(() => Int) openPorts!: number;
  @Field(() => Int) uniqueTechs!: number;
  @Field(() => SeverityCountsObject) findingsBySeverity!: SeverityCountsObject;
}
