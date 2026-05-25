import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { QueueName, QueuesModule } from '@autoscanner/queues';
import { ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { NmapScannerModule } from '@autoscanner/scanners-nmap';

import { AuthModule } from '../auth/auth.module';
import { ScansResolver } from './scans.resolver';
import { ScansService } from './scans.service';

import './dto/scan-status.enum';

@Module({
  imports: [
    AuthModule,
    QueuesModule,
    ScannerSdkModule,
    NmapScannerModule,
    BullModule.registerQueue({ name: QueueName.SCAN_JOBS }),
  ],
  providers: [ScansService, ScansResolver],
})
export class ScansModule {}
