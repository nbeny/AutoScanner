import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { QueueName, QueuesModule } from '@autoscanner/queues';

import { AuthModule } from '../auth/auth.module';
import { CveInfoResolver } from './cve-info.resolver';
import { CveInfoService } from './cve-info.service';
import { FindingsResolver } from './findings.resolver';
import { FindingsService } from './findings.service';

import './dto/severity.enum';

@Module({
  imports: [AuthModule, QueuesModule, BullModule.registerQueue({ name: QueueName.CVE_ENRICHMENT })],
  providers: [FindingsService, FindingsResolver, CveInfoService, CveInfoResolver],
})
export class FindingsModule {}
