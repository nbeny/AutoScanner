import { Module } from '@nestjs/common';

import { AppConfigModule } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { PrismaModule } from '@autoscanner/database';
import { MessagingModule } from '@autoscanner/messaging';
import { FindingClient, RiskClient } from '@autoscanner/service-clients';

import { ScheduleHydrator } from './schedule-hydrator.service';
import { CorrelationSweepScheduler } from './correlation-sweep.scheduler';

@Module({
  imports: [AppConfigModule, AppLoggingModule, PrismaModule, MessagingModule.forRoot()],
  providers: [ScheduleHydrator, CorrelationSweepScheduler, FindingClient, RiskClient],
})
export class AppModule {}
