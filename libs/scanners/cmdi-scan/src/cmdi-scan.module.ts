import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { CmdiScanScanner } from './cmdi-scan.scanner';

@Module({ imports: [ScannerSdkModule] })
export class CmdiScanScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(CmdiScanScanner.name)) {
      this.registry.register(CmdiScanScanner);
    }
  }
}
