import { Module } from '@nestjs/common';
import { FindingClient } from '@autoscanner/service-clients';
import { AuthModule } from '../auth/auth.module';
import {
  CorrelatedFindingFieldResolver,
  CorrelatedFindingsResolver,
} from './correlated-findings.resolver';
import { CorrelatedFindingsService } from './correlated-findings.service';

import './dto/finding-status.enum';

@Module({
  imports: [AuthModule],
  providers: [
    CorrelatedFindingsService,
    CorrelatedFindingsResolver,
    CorrelatedFindingFieldResolver,
    FindingClient,
  ],
})
export class CorrelatedFindingsModule {}
