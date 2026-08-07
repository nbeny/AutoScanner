import { Module } from '@nestjs/common';
import { ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { AllScannersModule } from '@autoscanner/scanners-all';

import { AuthModule } from '../auth/auth.module';
import { KALI_DATASET, KaliCatalogService } from './kali-catalog.service';
import { loadKaliDataset } from './kali/load-dataset';
import { ScannerCatalogService } from './scanner-catalog.service';
import { ToolsResolver } from './tools.resolver';
import { ToolsService } from './tools.service';

@Module({
  imports: [AuthModule, ScannerSdkModule, AllScannersModule],
  providers: [
    ToolsService,
    ScannerCatalogService,
    KaliCatalogService,
    ToolsResolver,
    { provide: KALI_DATASET, useFactory: () => loadKaliDataset() },
  ],
})
export class ToolsModule {}
