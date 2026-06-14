import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { AppConfigModule, AppConfigService } from '@autoscanner/config';
import { DEFAULT_JOB_OPTIONS } from './bullmq.config';
import { QueueName } from './queue-names';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (cfg: AppConfigService) => ({
        connection: { url: cfg.env.REDIS_URL },
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      }),
    }),
    BullModule.registerQueue(
      { name: QueueName.SCAN_JOBS },
      { name: QueueName.PARSE_JOBS },
      { name: QueueName.TEMPLATE_RUNS },
      { name: QueueName.CVE_ENRICHMENT },
      { name: QueueName.REPORT_JOBS },
      { name: QueueName.NOTIFICATION_JOBS },
      { name: QueueName.WEBHOOK_JOBS },
    ),
  ],
  exports: [BullModule],
})
export class QueuesModule {}
