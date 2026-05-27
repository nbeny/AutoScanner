import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DnsRecordsResolver } from './dns-records.resolver';
import { DnsRecordsService } from './dns-records.service';

import './dto/dns-record-type.enum';

@Module({
  imports: [AuthModule],
  providers: [DnsRecordsService, DnsRecordsResolver],
})
export class DnsRecordsModule {}
