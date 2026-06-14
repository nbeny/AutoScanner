import { Field, InputType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';
import { ArrayMinSize, IsString, MaxLength, MinLength } from 'class-validator';

import { NotificationChannelType } from './enums';

@InputType()
export class CreateNotificationChannelInput {
  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @Field(() => NotificationChannelType)
  type!: NotificationChannelType;

  @Field(() => [String])
  @ArrayMinSize(1)
  @IsString({ each: true })
  eventFilters!: string[];

  @Field(() => GraphQLJSON)
  config!: Record<string, unknown>;
}
