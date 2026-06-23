import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { SstiScanScanner } from './ssti-scan.scanner';

@Module({ imports: [ScannerSdkModule] })
export class SstiScanScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(SstiScanScanner.name)) {
      this.registry.register(SstiScanScanner);
    }
  }
}
