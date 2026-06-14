import { Field, InputType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';
import {
  ArrayMinSize,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { NotificationEventType } from '@autoscanner/notifications';

@InputType()
export class UpdateNotificationChannelInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @ArrayMinSize(1)
  @IsIn(Object.values(NotificationEventType), { each: true })
  @IsString({ each: true })
  eventFilters?: string[];

  @Field(() => GraphQLJSON, { nullable: true })
  @IsOptional()
  config?: Record<string, unknown>;
}
