import { Module } from '@nestjs/common';

import { AppConfigModule } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { PrismaModule } from '@autoscanner/database';
import { MessagingModule } from '@autoscanner/messaging';

import { NotificationAdaptersModule } from './notification-adapters.module';
import { NotificationProcessor } from './notification.processor';

@Module({
  imports: [
    AppConfigModule,
    AppLoggingModule,
    PrismaModule,
    MessagingModule.forRoot(),
    NotificationAdaptersModule,
  ],
  providers: [NotificationProcessor],
})
export class AppModule {}
