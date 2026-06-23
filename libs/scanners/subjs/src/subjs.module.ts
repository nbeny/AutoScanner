import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { SubjsScanner } from './subjs.scanner';

@Module({ imports: [ScannerSdkModule] })
export class SubjsScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(SubjsScanner.name)) {
      this.registry.register(SubjsScanner);
    }
  }
}
