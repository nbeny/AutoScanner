import { Field, ID, ObjectType } from '@nestjs/graphql';

/**
 * Returned once from createAgentRegistration.
 * bootstrapToken is single-use and 24h expiry — show it to the operator once.
 */
@ObjectType()
export class AgentRegistrationResult {
  @Field(() => ID)
  agentId!: string;

  @Field()
  bootstrapToken!: string;
}
