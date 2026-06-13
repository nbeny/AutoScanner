import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { FfufScanner } from './ffuf.scanner';

@Module({ imports: [ScannerSdkModule] })
export class FfufScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(FfufScanner.name)) {
      this.registry.register(FfufScanner);
    }
  }
}
