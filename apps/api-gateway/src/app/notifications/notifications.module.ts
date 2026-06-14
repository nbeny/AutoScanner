import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { QueueName } from '@autoscanner/queues';

import { AuthModule } from '../auth/auth.module';
import { NotificationsResolver } from './notifications.resolver';
import { NotificationsService } from './notifications.service';
import { secretBoxProvider } from './secret-box.provider';

import './dto/enums';

@Module({
  imports: [AuthModule, BullModule.registerQueue({ name: QueueName.NOTIFICATION_JOBS })],
  providers: [NotificationsService, NotificationsResolver, secretBoxProvider],
})
export class NotificationsModule {}
