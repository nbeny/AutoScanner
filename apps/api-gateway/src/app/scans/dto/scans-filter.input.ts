import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { IsArray, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

import { ScanGroup } from './scan-group.enum';
import { ScanStatus } from './scan-status.enum';

// Every field carries a class-validator decorator: the global ValidationPipe
// runs with { whitelist: true, forbidNonWhitelisted: true }, which builds its
// whitelist from class-validator metadata (not @Field). Without these the pipe
// rejects any provided property ("property <x> should not exist").
@InputType()
export class ScansFilterInput {
  @Field(() => ScanStatus, { nullable: true })
  @IsOptional()
  @IsEnum(ScanStatus)
  status?: ScanStatus;

  @Field(() => [ScanStatus], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsEnum(ScanStatus, { each: true })
  statusIn?: ScanStatus[];

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsString()
  engagementId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  scannerName?: string;

  @Field(() => ScanGroup, { nullable: true })
  @IsOptional()
  @IsEnum(ScanGroup)
  group?: ScanGroup;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}
