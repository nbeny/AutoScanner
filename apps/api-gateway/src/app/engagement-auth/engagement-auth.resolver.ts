import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { User } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EngagementAuthInput, EngagementAuthStatus } from './dto/engagement-auth.dto';
import { EngagementAuthService } from './engagement-auth.service';

@Resolver()
@UseGuards(JwtAuthGuard)
export class EngagementAuthResolver {
  constructor(private readonly svc: EngagementAuthService) {}

  @Mutation(() => Boolean)
  setEngagementAuthProfile(
    @CurrentUser() user: User,
    @Args('engagementId') engagementId: string,
    @Args('input') input: EngagementAuthInput,
  ): Promise<boolean> {
    return this.svc.set(user.id, engagementId, input);
  }

  @Mutation(() => Boolean)
  deleteEngagementAuthProfile(
    @CurrentUser() user: User,
    @Args('engagementId') engagementId: string,
  ): Promise<boolean> {
    return this.svc.delete(user.id, engagementId);
  }

  @Query(() => EngagementAuthStatus)
  engagementAuthProfile(
    @CurrentUser() user: User,
    @Args('engagementId') engagementId: string,
  ): Promise<EngagementAuthStatus> {
    return this.svc.status(user.id, engagementId);
  }
}
