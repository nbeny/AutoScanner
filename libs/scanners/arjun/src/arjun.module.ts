import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { ArjunScanner } from './arjun.scanner';

@Module({ imports: [ScannerSdkModule] })
export class ArjunScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(ArjunScanner.name)) {
      this.registry.register(ArjunScanner);
    }
  }
}
