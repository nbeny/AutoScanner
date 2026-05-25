import { Field, InputType } from '@nestjs/graphql';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

@InputType()
export class CreateEngagementInput {
  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  clientName!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  scopeText?: string;
}
