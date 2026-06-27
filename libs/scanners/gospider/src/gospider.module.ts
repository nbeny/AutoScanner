import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { GospiderScanner } from './gospider.scanner';

@Module({ imports: [ScannerSdkModule] })
export class GospiderScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(GospiderScanner.name)) {
      this.registry.register(GospiderScanner);
    }
  }
}
