import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { KatanaScanner } from './katana.scanner';

@Module({ imports: [ScannerSdkModule] })
export class KatanaScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(KatanaScanner.name)) {
      this.registry.register(KatanaScanner);
    }
  }
}
