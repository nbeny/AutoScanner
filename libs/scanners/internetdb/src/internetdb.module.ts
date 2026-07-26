import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { InternetdbScanner } from './internetdb.scanner';

@Module({ imports: [ScannerSdkModule] })
export class InternetdbScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(InternetdbScanner.name)) {
      this.registry.register(InternetdbScanner);
    }
  }
}
