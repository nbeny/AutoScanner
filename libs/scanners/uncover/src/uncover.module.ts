import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { UncoverScanner } from './uncover.scanner';

@Module({ imports: [ScannerSdkModule] })
export class UncoverScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(UncoverScanner.name)) {
      this.registry.register(UncoverScanner);
    }
  }
}
