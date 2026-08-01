import { Module } from '@nestjs/common';

import { AppConfigModule } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { PrismaModule } from '@autoscanner/database';
import { MessagingModule } from '@autoscanner/messaging';
import { NotificationsFanoutModule } from '@autoscanner/notifications';

import { NotificationAdaptersModule } from './notification-adapters.module';
import { NotificationProcessor } from './notification.processor';
import { RiskAlertConsumer } from './risk-alert.consumer';
import { CriticalFindingConsumer } from './critical-finding.consumer';

@Module({
  imports: [
    AppConfigModule,
    AppLoggingModule,
    PrismaModule,
    MessagingModule.forRoot(),
    NotificationAdaptersModule,
    NotificationsFanoutModule,
  ],
  providers: [NotificationProcessor, RiskAlertConsumer, CriticalFindingConsumer],
})
export class AppModule {}
