import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { QueueName, QueuesModule } from '@autoscanner/queues';

import { AuthModule } from '../auth/auth.module';
import { QueueHealthResolver } from './queue-health.resolver';

@Module({
  imports: [
    AuthModule,
    QueuesModule,
    BullModule.registerQueue(
      { name: QueueName.SCAN_JOBS },
      { name: QueueName.PARSE_JOBS },
      { name: QueueName.TEMPLATE_RUNS },
      { name: QueueName.AI_RUNS },
      { name: QueueName.CVE_ENRICHMENT },
    ),
  ],
  providers: [QueueHealthResolver],
})
export class QueueHealthModule {}
