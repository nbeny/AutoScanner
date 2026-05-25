import { Field, ID, ObjectType } from '@nestjs/graphql';
import { EngagementStatus } from './engagement-status.enum';

@ObjectType('Engagement')
export class EngagementObject {
  @Field(() => ID)
  id!: string;

  @Field()
  ownerId!: string;

  @Field()
  name!: string;

  @Field()
  clientName!: string;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  scopeText?: string;

  @Field({ nullable: true })
  startDate?: Date;

  @Field({ nullable: true })
  endDate?: Date;

  @Field(() => EngagementStatus)
  status!: EngagementStatus;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}
