import { UseGuards } from '@nestjs/common';
import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import type { User } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ToolActivityObject } from './dto/tool-activity.object';
import { ToolsService } from './tools.service';

@Resolver()
@UseGuards(JwtAuthGuard)
export class ToolsResolver {
  constructor(private readonly svc: ToolsService) {}

  @Query(() => [ToolActivityObject])
  toolActivity(
    @CurrentUser() user: User,
    @Args('engagementId', { type: () => ID, nullable: true }) engagementId?: string,
  ): Promise<ToolActivityObject[]> {
    return this.svc.toolActivity(user.id, { engagementId });
  }
}
