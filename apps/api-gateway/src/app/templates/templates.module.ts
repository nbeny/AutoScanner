import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { QueueName, QueuesModule } from '@autoscanner/queues';

import { AuthModule } from '../auth/auth.module';
import { TemplatesResolver } from './templates.resolver';
import { TemplatesService } from './templates.service';

import './dto/template-run-status.enum';

@Module({
  imports: [AuthModule, QueuesModule, BullModule.registerQueue({ name: QueueName.TEMPLATE_RUNS })],
  providers: [TemplatesService, TemplatesResolver],
})
export class TemplatesModule {}
