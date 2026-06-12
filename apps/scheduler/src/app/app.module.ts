import { Module } from '@nestjs/common';

import { AppConfigModule } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { PrismaModule } from '@autoscanner/database';
import { QueuesModule } from '@autoscanner/queues';

import { ScheduleHydrator } from './schedule-hydrator.service';

@Module({
  imports: [AppConfigModule, AppLoggingModule, PrismaModule, QueuesModule],
  providers: [ScheduleHydrator],
})
export class AppModule {}
