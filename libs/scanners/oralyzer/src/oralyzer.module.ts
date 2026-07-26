import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { OralyzerScanner } from './oralyzer.scanner';

@Module({ imports: [ScannerSdkModule] })
export class OralyzerScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(OralyzerScanner.name)) {
      this.registry.register(OralyzerScanner);
    }
  }
}
