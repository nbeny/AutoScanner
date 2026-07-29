import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { GarakScanner } from './garak.scanner';

@Module({ imports: [ScannerSdkModule] })
export class GarakScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(GarakScanner.name)) {
      this.registry.register(GarakScanner);
    }
  }
}
