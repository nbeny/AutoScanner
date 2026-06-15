import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { XssScanScanner } from './xss-scan.scanner';

@Module({ imports: [ScannerSdkModule] })
export class XssScanScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(XssScanScanner.name)) {
      this.registry.register(XssScanScanner);
    }
  }
}
