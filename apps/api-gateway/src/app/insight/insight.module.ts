import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { InsightResolver } from './insight.resolver';
import { InsightService } from './insight.service';

@Module({
  imports: [AuthModule],
  providers: [InsightService, InsightResolver],
})
export class InsightModule {}
