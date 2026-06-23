import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { CeroScanner } from './cero.scanner';

@Module({ imports: [ScannerSdkModule] })
export class CeroScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(CeroScanner.name)) {
      this.registry.register(CeroScanner);
    }
  }
}
