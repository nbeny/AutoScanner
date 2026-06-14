import { Field, ID, ObjectType } from '@nestjs/graphql';

import { NotificationChannelType } from './enums';

/**
 * GraphQL object for a notification channel.
 *
 * SECURITY: config / configEncrypted are intentionally omitted — secrets must
 * never be returned via the API.
 */
@ObjectType('NotificationChannel')
export class NotificationChannelObject {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field(() => NotificationChannelType)
  type!: NotificationChannelType;

  @Field()
  enabled!: boolean;

  @Field(() => [String])
  eventFilters!: string[];

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}
