import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { NiktoScanner } from './nikto.scanner';

@Module({ imports: [ScannerSdkModule] })
export class NiktoScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(NiktoScanner.name)) {
      this.registry.register(NiktoScanner);
    }
  }
}
