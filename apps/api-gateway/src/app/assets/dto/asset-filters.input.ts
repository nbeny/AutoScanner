import { Field, InputType, Int } from '@nestjs/graphql';
import { IsArray, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

import { Severity } from '../../findings/dto/severity.enum';

@InputType()
export class PortRangeInput {
  @Field(() => Int)
  @IsInt()
  @Min(1)
  @Max(65535)
  from!: number;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  @Max(65535)
  to!: number;
}

@InputType()
export class AssetFilters {
  /** Asset is kept when at least one of its findings has severity in this list.
   *  null or empty = no filter on severity. */
  @Field(() => [Severity], { nullable: true })
  @IsOptional()
  @IsArray()
  severityHas?: Severity[] | null;

  /** Asset is kept when at least one OPEN port number falls in any of these
   *  inclusive ranges. null or empty = no filter on ports. */
  @Field(() => [PortRangeInput], { nullable: true })
  @IsOptional()
  @IsArray()
  @Type(() => PortRangeInput)
  portRanges?: PortRangeInput[] | null;

  /** Asset is kept when at least one Technology.name matches any of these
   *  (case-insensitive exact match). null or empty = no filter. */
  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  techNames?: string[] | null;

  /** Asset is kept when at least one scanner that produced it (via Finding or
   *  Technology source) appears in this list. null or empty = no filter. */
  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scannerSources?: string[] | null;
}
