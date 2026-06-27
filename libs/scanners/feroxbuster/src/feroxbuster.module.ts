import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { FeroxbusterScanner } from './feroxbuster.scanner';

@Module({ imports: [ScannerSdkModule] })
export class FeroxbusterScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(FeroxbusterScanner.name)) {
      this.registry.register(FeroxbusterScanner);
    }
  }
}
