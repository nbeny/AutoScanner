import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { CensysScanner } from './censys.scanner';

@Module({ imports: [ScannerSdkModule] })
export class CensysScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(CensysScanner.name)) {
      this.registry.register(CensysScanner);
    }
  }
}
