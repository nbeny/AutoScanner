import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { QueueName, QueuesModule } from '@autoscanner/queues';

import { AuthModule } from '../auth/auth.module';
import { QueueHealthResolver } from './queue-health.resolver';

@Module({
  imports: [AuthModule, QueuesModule, BullModule.registerQueue({ name: QueueName.AI_RUNS })],
  providers: [QueueHealthResolver],
})
export class QueueHealthModule {}
