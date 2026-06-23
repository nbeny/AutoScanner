import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { ZapScanScanner } from './zap-scan.scanner';

@Module({ imports: [ScannerSdkModule] })
export class ZapScanScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(ZapScanScanner.name)) {
      this.registry.register(ZapScanScanner);
    }
  }
}
