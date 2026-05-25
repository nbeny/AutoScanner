import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { LogStreamModule } from '@autoscanner/log-stream';
import { QueueName, QueuesModule } from '@autoscanner/queues';
import { ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { NmapScannerModule } from '@autoscanner/scanners-nmap';

import { AuthModule } from '../auth/auth.module';
import { ScansResolver } from './scans.resolver';
import { ScansService } from './scans.service';

import './dto/scan-status.enum';
import './dto/scan-log-chunk.object';

@Module({
  imports: [
    AuthModule,
    QueuesModule,
    LogStreamModule,
    ScannerSdkModule,
    NmapScannerModule,
    BullModule.registerQueue({ name: QueueName.SCAN_JOBS }),
  ],
  providers: [ScansService, ScansResolver],
})
export class ScansModule {}
