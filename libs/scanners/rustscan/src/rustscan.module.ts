import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { RustscanScanner } from './rustscan.scanner';

@Module({ imports: [ScannerSdkModule] })
export class RustscanScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(RustscanScanner.name)) {
      this.registry.register(RustscanScanner);
    }
  }
}
