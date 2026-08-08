import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Severity } from '../../findings/dto/severity.enum';
import { FindingStatus } from './finding-status.enum';

// Every field carries a class-validator decorator: the global ValidationPipe runs
// with { whitelist, forbidNonWhitelisted }, so an undecorated field is rejected at
// runtime ("property <x> should not exist") and the query 400s before resolving.
@InputType()
export class CorrelatedFindingsFilterInput {
  @Field(() => ID, { nullable: true }) @IsOptional() @IsString() engagementId?: string;
  @Field(() => Severity, { nullable: true }) @IsOptional() @IsEnum(Severity) severity?: Severity;
  @Field(() => FindingStatus, { nullable: true })
  @IsOptional()
  @IsEnum(FindingStatus)
  status?: FindingStatus;
  @Field({ nullable: true }) @IsOptional() @IsString() search?: string;
  @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() @Min(1) limit?: number;
  @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() @Min(0) offset?: number;
}
