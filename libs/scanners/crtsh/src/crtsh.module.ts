import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { CrtshScanner } from './crtsh.scanner';

@Module({ imports: [ScannerSdkModule] })
export class CrtshScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(CrtshScanner.name)) {
      this.registry.register(CrtshScanner);
    }
  }
}
