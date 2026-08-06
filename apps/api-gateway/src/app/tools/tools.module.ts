import { Module } from '@nestjs/common';
import { ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { AllScannersModule } from '@autoscanner/scanners-all';

import { AuthModule } from '../auth/auth.module';
import { ScannerCatalogService } from './scanner-catalog.service';
import { ToolsResolver } from './tools.resolver';
import { ToolsService } from './tools.service';

@Module({
  imports: [AuthModule, ScannerSdkModule, AllScannersModule],
  providers: [ToolsService, ScannerCatalogService, ToolsResolver],
})
export class ToolsModule {}
