import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { GauScanner } from './gau.scanner';

@Module({ imports: [ScannerSdkModule] })
export class GauScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(GauScanner.name)) {
      this.registry.register(GauScanner);
    }
  }
}
