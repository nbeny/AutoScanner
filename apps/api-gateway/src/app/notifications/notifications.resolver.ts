import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { User } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateNotificationChannelInput } from './dto/create-notification-channel.input';
import { UpdateNotificationChannelInput } from './dto/update-notification-channel.input';
import { NotificationChannelObject } from './dto/notification-channel.object';
import { NotificationObject } from './dto/notification.object';
import { NotificationsService } from './notifications.service';

@Resolver(() => NotificationChannelObject)
@UseGuards(JwtAuthGuard)
export class NotificationsResolver {
  constructor(private readonly svc: NotificationsService) {}

  @Query(() => [NotificationChannelObject])
  notificationChannels(@CurrentUser() user: User): Promise<NotificationChannelObject[]> {
    return this.svc.listChannels(user.id) as Promise<NotificationChannelObject[]>;
  }

  @Query(() => [NotificationObject])
  channelDeliveries(
    @CurrentUser() user: User,
    @Args('channelId', { type: () => ID }) channelId: string,
  ): Promise<NotificationObject[]> {
    return this.svc.listDeliveries(user.id, channelId) as Promise<NotificationObject[]>;
  }

  @Mutation(() => NotificationChannelObject)
  createNotificationChannel(
    @CurrentUser() user: User,
    @Args('input') input: CreateNotificationChannelInput,
  ): Promise<NotificationChannelObject> {
    return this.svc.createChannel(user.id, input) as Promise<NotificationChannelObject>;
  }

  @Mutation(() => NotificationChannelObject)
  updateNotificationChannel(
    @CurrentUser() user: User,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateNotificationChannelInput,
  ): Promise<NotificationChannelObject> {
    return this.svc.updateChannel(user.id, id, input) as Promise<NotificationChannelObject>;
  }

  @Mutation(() => Boolean)
  deleteNotificationChannel(
    @CurrentUser() user: User,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.svc.softDeleteChannel(user.id, id);
  }

  @Mutation(() => NotificationObject)
  testNotificationChannel(
    @CurrentUser() user: User,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<NotificationObject> {
    return this.svc.testChannel(user.id, id) as Promise<NotificationObject>;
  }
}
