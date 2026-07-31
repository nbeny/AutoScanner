import { Module } from '@nestjs/common';
import { ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { AllScannersModule } from '@autoscanner/scanners-all';

import { AuthModule } from '../auth/auth.module';
import { AgentsController } from './agents.controller';
import { AgentsResolver } from './agents.resolver';
import { AgentsService } from './agents.service';

@Module({
  imports: [AuthModule, ScannerSdkModule, AllScannersModule],
  controllers: [AgentsController],
  providers: [AgentsService, AgentsResolver],
})
export class AgentsModule {}
