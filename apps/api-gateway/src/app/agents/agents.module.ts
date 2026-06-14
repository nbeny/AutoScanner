import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { AllScannersModule } from '@autoscanner/scanners-all';
import { QueueName, QueuesModule } from '@autoscanner/queues';

import { AuthModule } from '../auth/auth.module';
import { AgentsController } from './agents.controller';
import { AgentsResolver } from './agents.resolver';
import { AgentsService } from './agents.service';

@Module({
  imports: [
    AuthModule,
    QueuesModule,
    ScannerSdkModule,
    AllScannersModule,
    BullModule.registerQueue({ name: QueueName.PARSE_JOBS }),
  ],
  controllers: [AgentsController],
  providers: [AgentsService, AgentsResolver],
})
export class AgentsModule {}
