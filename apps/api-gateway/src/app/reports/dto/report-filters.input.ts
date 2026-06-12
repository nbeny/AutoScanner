import { Field, Float, InputType } from '@nestjs/graphql';
import { IsArray, IsEnum, IsNumber, IsOptional, Max, Min } from 'class-validator';

import { AssetType } from '../../assets/dto/asset-type.enum';
import { Severity } from '../../findings/dto/severity.enum';

@InputType()
export class ReportFiltersInput {
  @Field(() => Severity, { nullable: true })
  @IsOptional()
  @IsEnum(Severity)
  severityMin?: Severity;

  @Field(() => [AssetType], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsEnum(AssetType, { each: true })
  kinds?: AssetType[];

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  riskScoreMin?: number;
}
