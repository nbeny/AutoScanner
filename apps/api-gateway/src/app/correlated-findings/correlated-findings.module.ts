import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CorrelatedFindingsResolver } from './correlated-findings.resolver';
import { CorrelatedFindingsService } from './correlated-findings.service';

import './dto/finding-status.enum';

@Module({
  imports: [AuthModule],
  providers: [CorrelatedFindingsService, CorrelatedFindingsResolver],
})
export class CorrelatedFindingsModule {}
