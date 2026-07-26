import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { SherlockScanner } from './sherlock.scanner';

@Module({ imports: [ScannerSdkModule] })
export class SherlockScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(SherlockScanner.name)) {
      this.registry.register(SherlockScanner);
    }
  }
}
