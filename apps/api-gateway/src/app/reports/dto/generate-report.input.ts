import { Field, ID, InputType } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';

import { ReportFiltersInput } from './report-filters.input';

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

  @Field(() => ReportFiltersInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => ReportFiltersInput)
  filters?: ReportFiltersInput;
}
