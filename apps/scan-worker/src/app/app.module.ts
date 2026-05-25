import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { AppConfigModule } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { PrismaModule } from '@autoscanner/database';
import { DockerRunnerModule } from '@autoscanner/docker-runner';
import { LogStreamModule } from '@autoscanner/log-stream';
import { QueueName, QueuesModule } from '@autoscanner/queues';
import { ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { StorageModule } from '@autoscanner/storage';
import { NmapScannerModule } from '@autoscanner/scanners-nmap';

import { ScanJobProcessor } from './scan-job.processor';

@Module({
  imports: [
    AppConfigModule,
    AppLoggingModule,
    PrismaModule,
    QueuesModule,
    DockerRunnerModule,
    StorageModule,
    LogStreamModule,
    ScannerSdkModule,
    NmapScannerModule,
    BullModule.registerQueue({ name: QueueName.PARSE_JOBS }),
  ],
  providers: [ScanJobProcessor],
})
export class AppModule {}
