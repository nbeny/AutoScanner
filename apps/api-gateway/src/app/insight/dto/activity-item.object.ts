import { Field, ID, ObjectType } from '@nestjs/graphql';
import { ActivityKind } from './activity-kind.enum';

@ObjectType()
export class ActivityItemObject {
  @Field(() => ID) id!: string;
  @Field(() => ActivityKind) kind!: ActivityKind;
  @Field(() => ID) engagementId!: string;
  @Field() engagementName!: string;
  @Field() label!: string;
  @Field() status!: string;
  @Field(() => Date) ts!: Date;
}
