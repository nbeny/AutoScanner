import { UseGuards } from '@nestjs/common';
import { Args, ID, Int, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import type { User } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RunAiScanInput } from './dto/run-ai-scan.input';
import { AiRunObject } from './dto/ai-run.object';
import { AiRunNodeObject } from './dto/ai-run-node.object';
import { AiDecisionObject } from './dto/ai-decision.object';
import { AiRunsService } from './ai-runs.service';

@Resolver(() => AiRunObject)
@UseGuards(JwtAuthGuard)
export class AiRunsResolver {
  constructor(private readonly svc: AiRunsService) {}

  @Mutation(() => AiRunObject)
  runAiScan(@CurrentUser() user: User, @Args('input') input: RunAiScanInput): Promise<AiRunObject> {
    return this.svc.runAiScan(user.id, input) as Promise<AiRunObject>;
  }

  @Query(() => AiRunObject, { nullable: true })
  aiRun(
    @CurrentUser() user: User,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<AiRunObject | null> {
    return this.svc.getForOwner(user.id, id) as Promise<AiRunObject | null>;
  }

  @Query(() => [AiRunObject])
  aiRuns(
    @CurrentUser() user: User,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ): Promise<AiRunObject[]> {
    return this.svc.listForOwner(user.id, limit ?? undefined) as Promise<AiRunObject[]>;
  }

  @Mutation(() => AiRunObject)
  cancelAiRun(
    @CurrentUser() user: User,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<AiRunObject> {
    return this.svc.cancel(user.id, id) as Promise<AiRunObject>;
  }

  @ResolveField(() => [AiRunNodeObject])
  nodes(@Parent() run: AiRunObject): Promise<AiRunNodeObject[]> {
    return this.svc.nodesFor(run.id) as Promise<AiRunNodeObject[]>;
  }

  @ResolveField(() => [AiDecisionObject])
  decisions(@Parent() run: AiRunObject): Promise<AiDecisionObject[]> {
    return this.svc.decisionsFor(run.id) as Promise<AiDecisionObject[]>;
  }
}
