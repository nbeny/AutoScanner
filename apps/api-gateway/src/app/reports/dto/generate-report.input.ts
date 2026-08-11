import { Field, ID, InputType } from '@nestjs/graphql';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

@InputType()
export class GenerateReportInput {
  @Field(() => ID)
  @IsString()
  engagementId!: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsString()
  scanId?: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  templateSlug!: string;
}
