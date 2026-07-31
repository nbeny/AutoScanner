import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CveInfoResolver } from './cve-info.resolver';
import { CveInfoService } from './cve-info.service';
import { FindingsResolver } from './findings.resolver';
import { FindingsService } from './findings.service';

import './dto/severity.enum';

@Module({
  imports: [AuthModule],
  providers: [FindingsService, FindingsResolver, CveInfoService, CveInfoResolver],
})
export class FindingsModule {}
