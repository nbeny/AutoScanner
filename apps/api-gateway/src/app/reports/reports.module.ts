import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { QueueName, QueuesModule } from '@autoscanner/queues';

import { AuthModule } from '../auth/auth.module';
import { ReportsController } from './reports.controller';
import { ReportsResolver } from './reports.resolver';
import { ReportsService } from './reports.service';

import './dto/report-format.enum';
import './dto/report-status.enum';

@Module({
  imports: [AuthModule, QueuesModule, BullModule.registerQueue({ name: QueueName.REPORT_JOBS })],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsResolver],
})
export class ReportsModule {}
