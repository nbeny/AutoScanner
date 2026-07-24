import { Field, InputType } from '@nestjs/graphql';
import { IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

import { GuardrailsInput } from './guardrails.input';

@InputType()
export class RunAiScanInput {
  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  target!: string;

  @Field(() => GuardrailsInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => GuardrailsInput)
  guardrails?: GuardrailsInput;
}
