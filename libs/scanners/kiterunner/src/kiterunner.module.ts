import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { KiterunnerScanner } from './kiterunner.scanner';

@Module({ imports: [ScannerSdkModule] })
export class KiterunnerScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(KiterunnerScanner.name)) {
      this.registry.register(KiterunnerScanner);
    }
  }
}
