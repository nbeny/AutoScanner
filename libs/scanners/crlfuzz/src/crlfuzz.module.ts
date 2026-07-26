import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { CrlfuzzScanner } from './crlfuzz.scanner';

@Module({ imports: [ScannerSdkModule] })
export class CrlfuzzScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(CrlfuzzScanner.name)) {
      this.registry.register(CrlfuzzScanner);
    }
  }
}
