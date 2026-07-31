import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { User } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiRunObject } from '../ai-runs/dto/ai-run.object';
import { ChainLauncher } from './chains.service';
import { RunChainInput } from './dto/run-chain.input';
import { ChainCapabilityObject } from './dto/chain-capability.object';

@Resolver(() => ChainCapabilityObject)
@UseGuards(JwtAuthGuard)
export class ChainsResolver {
  constructor(private readonly svc: ChainLauncher) {}

  @Query(() => [ChainCapabilityObject])
  chains(): ChainCapabilityObject[] {
    return this.svc.listCapabilities() as ChainCapabilityObject[];
  }

  @Mutation(() => AiRunObject)
  runChain(@CurrentUser() user: User, @Args('input') input: RunChainInput): Promise<AiRunObject> {
    return this.svc.launch(user.id, input) as Promise<AiRunObject>;
  }
}
