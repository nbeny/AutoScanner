import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { AppConfigModule } from '@autoscanner/config';
import { CapabilityModule } from '@autoscanner/auth';
import { QueueName, QueuesModule } from '@autoscanner/queues';

import { AuthModule } from '../auth/auth.module';
import { AiRunsResolver } from './ai-runs.resolver';
import { AiRunsService } from './ai-runs.service';
import { QuickScanProvisioner } from './quick-scan-provisioner.service';

@Module({
  imports: [
    AuthModule,
    AppConfigModule,
    QueuesModule,
    BullModule.registerQueue({ name: QueueName.AI_RUNS }),
    CapabilityModule,
  ],
  providers: [AiRunsService, AiRunsResolver, QuickScanProvisioner],
})
export class AiRunsModule {}
