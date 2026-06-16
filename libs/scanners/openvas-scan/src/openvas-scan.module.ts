import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { OpenvasScanScanner } from './openvas-scan.scanner';

@Module({ imports: [ScannerSdkModule] })
export class OpenvasScanScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(OpenvasScanScanner.name)) {
      this.registry.register(OpenvasScanScanner);
    }
  }
}
