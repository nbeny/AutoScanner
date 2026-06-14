import { Field, InputType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';
import {
  ArrayMinSize,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

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
  @IsString({ each: true })
  eventFilters?: string[];

  @Field(() => GraphQLJSON, { nullable: true })
  @IsOptional()
  config?: Record<string, unknown>;
}
