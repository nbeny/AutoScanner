import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { EngagementStatus } from '../../engagements/dto/engagement-status.enum';
import { SeverityCountsObject } from './severity-counts.object';

@ObjectType()
export class EngagementSummaryObject {
  @Field(() => ID) id!: string;
  @Field() name!: string;
  @Field() clientName!: string;
  @Field(() => EngagementStatus) status!: EngagementStatus;
  @Field(() => Date) createdAt!: Date;
  @Field(() => Int) assetCount!: number;
  @Field(() => SeverityCountsObject) findingsBySeverity!: SeverityCountsObject;
  @Field(() => Date) lastActivityAt!: Date;
}
