import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { AlterxScanner } from './alterx.scanner';

@Module({ imports: [ScannerSdkModule] })
export class AlterxScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(AlterxScanner.name)) {
      this.registry.register(AlterxScanner);
    }
  }
}
