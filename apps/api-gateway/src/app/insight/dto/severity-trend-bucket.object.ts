import { Field, ObjectType } from '@nestjs/graphql';
import { SeverityCountsObject } from './severity-counts.object';

@ObjectType()
export class SeverityTrendBucketObject {
  @Field() bucketDate!: string;
  @Field(() => SeverityCountsObject) counts!: SeverityCountsObject;
}
