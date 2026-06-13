import { UseGuards } from '@nestjs/common';
import { Args, ID, Int, Query, Resolver } from '@nestjs/graphql';
import type { User } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EndpointObject } from './dto/endpoint.object';
import { EndpointsService } from './endpoints.service';

@Resolver(() => EndpointObject)
@UseGuards(JwtAuthGuard)
export class EndpointsResolver {
  constructor(private readonly svc: EndpointsService) {}

  @Query(() => [EndpointObject])
  endpoints(
    @CurrentUser() user: User,
    @Args('engagementId', { type: () => ID }) engagementId: string,
    @Args('subdomainId', { type: () => ID, nullable: true }) subdomainId?: string | null,
    @Args('search', { type: () => String, nullable: true }) search?: string | null,
    @Args('limit', { type: () => Int, defaultValue: 100 }) limit?: number,
    @Args('offset', { type: () => Int, defaultValue: 0 }) offset?: number,
  ): Promise<EndpointObject[]> {
    return this.svc.list(user.id, engagementId, { subdomainId, search, limit, offset });
  }

  @Query(() => Int)
  endpointCount(
    @CurrentUser() user: User,
    @Args('engagementId', { type: () => ID }) engagementId: string,
  ): Promise<number> {
    return this.svc.count(user.id, engagementId);
  }
}
