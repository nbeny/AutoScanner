import { Module } from '@nestjs/common';

import { AppConfigModule } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { PrismaModule } from '@autoscanner/database';
import { MessagingModule } from '@autoscanner/messaging';

import { ScheduleHydrator } from './schedule-hydrator.service';

@Module({
  imports: [AppConfigModule, AppLoggingModule, PrismaModule, MessagingModule.forRoot()],
  providers: [ScheduleHydrator],
})
export class AppModule {}
