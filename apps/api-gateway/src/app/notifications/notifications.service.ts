import { Inject, Injectable, Logger } from '@nestjs/common';
import { DeliveryStatus, type NotificationChannel, type Notification } from '@prisma/client';

import { NotFoundError, SecretBox, ValidationError } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';
import type { NotificationJobPayload } from '@autoscanner/queues';
import { JOB_BUS, type JobBus } from '@autoscanner/messaging';

import { CreateNotificationChannelInput } from './dto/create-notification-channel.input';
import { UpdateNotificationChannelInput } from './dto/update-notification-channel.input';
import { SECRET_BOX } from './secret-box.provider';

const NOTIFICATION_TOPIC = 'security.notification.requested';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SECRET_BOX) private readonly secretBox: SecretBox,
    @Inject(JOB_BUS) private readonly bus: JobBus,
  ) {}

  async createChannel(
    userId: string,
    input: CreateNotificationChannelInput,
  ): Promise<NotificationChannel> {
    if (!input.eventFilters || input.eventFilters.length === 0) {
      throw new ValidationError('eventFilters must contain at least one event type');
    }

    const configEncrypted = this.secretBox.seal(JSON.stringify(input.config));

    return this.prisma.notificationChannel.create({
      data: {
        userId,
        name: input.name,
        type: input.type,
        eventFilters: input.eventFilters,
        configEncrypted,
        enabled: true,
      },
    });
  }

  listChannels(userId: string): Promise<NotificationChannel[]> {
    return this.prisma.notificationChannel.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateChannel(
    userId: string,
    id: string,
    input: UpdateNotificationChannelInput,
  ): Promise<NotificationChannel> {
    await this.requireOwned(userId, id);

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data['name'] = input.name;
    if (input.enabled !== undefined) data['enabled'] = input.enabled;
    if (input.eventFilters !== undefined) data['eventFilters'] = input.eventFilters;
    if (input.config !== undefined) {
      data['configEncrypted'] = this.secretBox.seal(JSON.stringify(input.config));
    }

    return this.prisma.notificationChannel.update({
      where: { id },
      data,
    });
  }

  async softDeleteChannel(userId: string, id: string): Promise<boolean> {
    await this.requireOwned(userId, id);

    await this.prisma.notificationChannel.update({
      where: { id },
      data: { deletedAt: new Date(), enabled: false },
    });

    this.logger.log(`Soft-deleted notification channel=${id}`);
    return true;
  }

  listDeliveries(userId: string, channelId: string): Promise<Notification[]> {
    return this.prisma.notification.findMany({
      where: {
        channelId,
        channel: { userId, deletedAt: null },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async testChannel(userId: string, id: string): Promise<Notification> {
    await this.requireOwned(userId, id);

    const notif = await this.prisma.notification.create({
      data: {
        channelId: id,
        eventType: 'test',
        payload: { engagementId: 'test', engagementName: 'Test channel' },
      },
    });

    try {
      await this.bus.publish<NotificationJobPayload>(NOTIFICATION_TOPIC, notif.id, {
        notificationId: notif.id,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to enqueue test notification=${notif.id}: ${message}`);
      await this.prisma.notification
        .update({
          where: { id: notif.id },
          data: {
            deliveryStatus: DeliveryStatus.FAILED,
            errorMessage: `enqueue failed: ${message}`.slice(0, 500),
          },
        })
        .catch((updateErr) => {
          const um = updateErr instanceof Error ? updateErr.message : String(updateErr);
          this.logger.warn(`notification=${notif.id} FAILED-status reconciliation failed: ${um}`);
        });
      throw err;
    }

    this.logger.log(`Enqueued test notification=${notif.id} for channel=${id}`);
    return notif;
  }

  private async requireOwned(userId: string, id: string): Promise<NotificationChannel> {
    const found = await this.prisma.notificationChannel.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!found) throw new NotFoundError('NotificationChannel', id);
    return found;
  }
}
