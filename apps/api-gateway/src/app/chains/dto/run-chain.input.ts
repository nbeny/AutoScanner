import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { GuardrailsInput } from '../../ai-runs/dto/guardrails.input';

// Every field carries a class-validator decorator: the global ValidationPipe runs
// with { whitelist, forbidNonWhitelisted }, so an undecorated field is rejected at
// runtime ("property <x> should not exist") and the mutation 400s before resolving.
@InputType()
export class RunChainInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  chainName!: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  target!: string;

  @Field(() => GuardrailsInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => GuardrailsInput)
  guardrails?: GuardrailsInput;
}
