import { Inject, Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { DeliveryStatus } from '@prisma/client';

import { PrismaService } from '@autoscanner/database';
import { QueueName, type NotificationJobPayload } from '@autoscanner/queues';
import type { SecretBox } from '@autoscanner/common';
import {
  NotificationDispatcher,
  NotificationEventType,
  renderNotificationMessage,
  type NotificationEventPayload,
} from '@autoscanner/notifications';

import { SECRET_BOX } from './notification-adapters.module';

@Processor(QueueName.NOTIFICATION_JOBS)
@Injectable()
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: NotificationDispatcher,
    @Inject(SECRET_BOX) private readonly secretBox: SecretBox,
  ) {
    super();
  }

  async process(job: Job<NotificationJobPayload>): Promise<void> {
    const { notificationId } = job.data;

    // Step 1: Load Notification with channel
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      include: { channel: true },
    });

    if (!notification) {
      this.logger.warn(`Notification ${notificationId} not found — skipping`);
      return;
    }

    const { channel } = notification;

    // Step 1b: Guard against disabled/deleted channel
    if (!channel.enabled || channel.deletedAt !== null) {
      const reason = !channel.enabled ? 'channel disabled' : 'channel deleted';
      this.logger.warn(`Notification ${notificationId}: ${reason}, marking FAILED`);
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          deliveryStatus: DeliveryStatus.FAILED,
          errorMessage: reason,
          lastAttemptAt: new Date(),
        },
      });
      return;
    }

    // Step 2: Decrypt channel config (Prisma Bytes → Buffer)
    const config = JSON.parse(this.secretBox.open(Buffer.from(channel.configEncrypted))) as Record<
      string,
      unknown
    >;

    // Step 3: Render message
    const message = renderNotificationMessage(
      notification.eventType as NotificationEventType,
      notification.payload as unknown as NotificationEventPayload,
    );

    // Step 4: Bump attemptCount + lastAttemptAt
    await this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        attemptCount: { increment: 1 },
        lastAttemptAt: new Date(),
      },
    });

    // Step 5 & 6: Dispatch, then update status
    try {
      await this.dispatcher.dispatch(channel.type, config, message);

      // On success: SENT
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          deliveryStatus: DeliveryStatus.SENT,
          sentAt: new Date(),
        },
      });
      this.logger.log(`Notification ${notificationId} SENT via ${channel.type}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Notification ${notificationId} FAILED: ${errorMessage}`);
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          deliveryStatus: DeliveryStatus.FAILED,
          errorMessage: errorMessage.slice(0, 500),
        },
      });
      // Rethrow so BullMQ retry policy applies
      throw err;
    }
  }
}
