import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { CdncheckScanner } from './cdncheck.scanner';

@Module({ imports: [ScannerSdkModule] })
export class CdncheckScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(CdncheckScanner.name)) {
      this.registry.register(CdncheckScanner);
    }
  }
}
