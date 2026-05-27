import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateEngagementInput } from './dto/create-engagement.input';
import { CreateScopeRuleInput } from './dto/create-scope-rule.input';
import { EngagementObject } from './dto/engagement.object';
import { ScopeRuleObject } from './dto/scope-rule.object';
import { EngagementsService } from './engagements.service';

@Resolver(() => EngagementObject)
@UseGuards(JwtAuthGuard)
export class EngagementsResolver {
  constructor(private readonly svc: EngagementsService) {}

  @Mutation(() => EngagementObject)
  createEngagement(
    @CurrentUser() user: User,
    @Args('input') input: CreateEngagementInput,
  ): Promise<EngagementObject> {
    return this.svc.create(user.id, input) as Promise<EngagementObject>;
  }

  @Mutation(() => ScopeRuleObject)
  createScopeRule(
    @CurrentUser() user: User,
    @Args('input') input: CreateScopeRuleInput,
  ): Promise<ScopeRuleObject> {
    return this.svc.createScopeRule(user.id, input) as Promise<ScopeRuleObject>;
  }

  @Query(() => [EngagementObject])
  engagements(@CurrentUser() user: User): Promise<EngagementObject[]> {
    return this.svc.listForOwner(user.id) as Promise<EngagementObject[]>;
  }

  @Query(() => EngagementObject)
  engagement(
    @CurrentUser() user: User,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<EngagementObject> {
    return this.svc.getByIdForOwner(user.id, id) as Promise<EngagementObject>;
  }
}
