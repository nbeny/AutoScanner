import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { WpscanScanner } from './wpscan.scanner';

@Module({ imports: [ScannerSdkModule] })
export class WpscanScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(WpscanScanner.name)) {
      this.registry.register(WpscanScanner);
    }
  }
}
