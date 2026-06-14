import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { User } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AgentObject } from './dto/agent.object';
import { AgentRegistrationResult } from './dto/agent-registration-result.object';
import { CreateAgentRegistrationInput } from './dto/create-agent-registration.input';
import { AgentsService } from './agents.service';

@Resolver(() => AgentObject)
@UseGuards(JwtAuthGuard)
export class AgentsResolver {
  constructor(private readonly svc: AgentsService) {}

  @Query(() => [AgentObject])
  agents(@CurrentUser() user: User): Promise<AgentObject[]> {
    return this.svc.listForOwner(user.id) as Promise<AgentObject[]>;
  }

  @Mutation(() => AgentRegistrationResult)
  async createAgentRegistration(
    @CurrentUser() user: User,
    @Args('input') input: CreateAgentRegistrationInput,
  ): Promise<AgentRegistrationResult> {
    const result = await this.svc.createRegistration(user.id, input);
    return {
      agentId: result.agent.id,
      bootstrapToken: result.bootstrapToken,
    };
  }

  @Mutation(() => Boolean)
  revokeAgent(
    @CurrentUser() user: User,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.svc.revoke(user.id, id);
  }
}
