import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver, Subscription } from '@nestjs/graphql';
import type { User } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RunKaliToolInput } from './dto/run-kali-tool.input';
import { KaliToolRunObject } from './dto/kali-tool-run.object';
import { KaliToolRunEventObject } from './dto/kali-tool-run-event.object';
import { KaliRunsService } from './kali-runs.service';
import {
  KaliToolRunEventsSubscriber,
  type KaliToolRunEventMessage,
} from './kali-tool-run-events.subscriber';

@Resolver()
@UseGuards(JwtAuthGuard)
export class KaliRunsResolver {
  constructor(
    private readonly svc: KaliRunsService,
    private readonly eventsSubscriber: KaliToolRunEventsSubscriber,
  ) {}

  @Mutation(() => KaliToolRunObject)
  runKaliTool(
    @CurrentUser() user: User,
    @Args('input') input: RunKaliToolInput,
  ): Promise<KaliToolRunObject> {
    return this.svc.runKaliTool(user.id, input);
  }

  @Query(() => KaliToolRunObject, { nullable: true })
  kaliToolRun(@Args('id', { type: () => ID }) id: string): Promise<KaliToolRunObject | null> {
    return this.svc.kaliToolRun(id);
  }

  @Query(() => [KaliToolRunObject])
  kaliToolRuns(
    @Args('engagementId', { type: () => ID }) engagementId: string,
  ): Promise<KaliToolRunObject[]> {
    return this.svc.kaliToolRuns(engagementId);
  }

  @Subscription(() => KaliToolRunEventObject, {
    name: 'kaliToolRunEvents',
    resolve: (msg: KaliToolRunEventMessage): KaliToolRunEventObject => ({
      type: String(msg.type),
      status: msg.status as string | undefined,
      message: msg.message as string | undefined,
      data: msg.data,
    }),
  })
  kaliToolRunEvents(
    @Args('runId', { type: () => ID }) runId: string,
  ): AsyncIterable<KaliToolRunEventMessage> {
    return this.eventsSubscriber.subscribe(runId);
  }
}
