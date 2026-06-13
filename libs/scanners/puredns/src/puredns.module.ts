import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { PurednsScanner } from './puredns.scanner';

@Module({ imports: [ScannerSdkModule] })
export class PurednsScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(PurednsScanner.name)) {
      this.registry.register(PurednsScanner);
    }
  }
}
