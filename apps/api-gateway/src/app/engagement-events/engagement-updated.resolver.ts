import { ForbiddenException, UseGuards } from '@nestjs/common';
import { Args, ID, Resolver, Subscription } from '@nestjs/graphql';
import type { User } from '@prisma/client';

import { PrismaService } from '@autoscanner/database';
import type { EngagementUpdateEvent } from '@autoscanner/engagement-events';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EngagementUpdateEventObject } from './dto/engagement-update-event.object';
import { EngagementEventsSubscriberService } from './engagement-events-subscriber.service';

@Resolver()
@UseGuards(JwtAuthGuard)
export class EngagementUpdatedResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriber: EngagementEventsSubscriberService,
  ) {}

  @Subscription(() => EngagementUpdateEventObject, {
    name: 'engagementUpdated',
    resolve: (ev: EngagementUpdateEvent): EngagementUpdateEventObject => ({
      kind: ev.kind,
      engagementId: ev.engagementId,
      assetId: ev.assetId,
      templateRunId: ev.templateRunId,
      ts: ev.ts,
    }),
  })
  async engagementUpdated(
    @CurrentUser() user: User,
    @Args('engagementId', { type: () => ID }) engagementId: string,
  ): Promise<AsyncIterable<EngagementUpdateEvent>> {
    const engagement = await this.prisma.engagement.findFirst({
      where: { id: engagementId, ownerId: user.id, deletedAt: null },
      select: { id: true },
    });
    if (!engagement) {
      throw new ForbiddenException('Engagement not found or access denied');
    }
    return this.subscriber.subscribe(engagementId);
  }
}
