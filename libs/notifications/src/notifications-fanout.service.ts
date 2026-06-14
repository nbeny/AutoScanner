import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@autoscanner/database';
import { QueueName, type NotificationJobPayload } from '@autoscanner/queues';
import { NotificationEventType, type NotificationEventPayload } from './event-types';

@Injectable()
export class NotificationsFanoutService {
  private readonly logger = new Logger(NotificationsFanoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QueueName.NOTIFICATION_JOBS) private readonly queue: Queue<NotificationJobPayload>,
  ) {}

  async fanout(
    eventType: NotificationEventType,
    payload: NotificationEventPayload,
  ): Promise<number> {
    const engagement = await this.prisma.engagement.findUnique({
      where: { id: payload.engagementId },
      select: { ownerId: true, name: true },
    });
    if (!engagement) return 0;

    const channels = await this.prisma.notificationChannel.findMany({
      where: {
        userId: engagement.ownerId,
        enabled: true,
        deletedAt: null,
        eventFilters: { has: eventType },
      },
      select: { id: true },
    });
    if (channels.length === 0) return 0;

    const enriched = { ...payload, engagementName: payload.engagementName ?? engagement.name };
    let enqueued = 0;
    for (const ch of channels) {
      const notif = await this.prisma.notification.create({
        data: { channelId: ch.id, eventType, payload: enriched as Prisma.InputJsonValue },
        select: { id: true },
      });
      try {
        await this.queue.add('notify', { notificationId: notif.id });
        enqueued++;
      } catch (err) {
        this.logger.warn(`enqueue failed for notification=${notif.id}: ${(err as Error).message}`);
      }
    }
    this.logger.log(
      `fanout ${eventType} eng=${payload.engagementId}: ${enqueued}/${channels.length}`,
    );
    return enqueued;
  }
}
