import { Field, InputType } from '@nestjs/graphql';
import { GuardrailsInput } from '../../ai-runs/dto/guardrails.input';

@InputType()
export class RunChainInput {
  @Field()
  chainName!: string;

  @Field()
  target!: string;

  @Field(() => GuardrailsInput, { nullable: true })
  guardrails?: GuardrailsInput;
}
