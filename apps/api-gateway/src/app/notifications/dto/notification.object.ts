import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

import { DeliveryStatus } from './enums';

@ObjectType('Notification')
export class NotificationObject {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  channelId!: string;

  @Field()
  eventType!: string;

  @Field(() => DeliveryStatus)
  deliveryStatus!: DeliveryStatus;

  @Field(() => Int)
  attemptCount!: number;

  @Field(() => Date, { nullable: true })
  lastAttemptAt?: Date | null;

  @Field(() => String, { nullable: true })
  errorMessage?: string | null;

  @Field(() => Date, { nullable: true })
  sentAt?: Date | null;

  @Field()
  createdAt!: Date;
}
