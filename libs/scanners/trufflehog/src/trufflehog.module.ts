import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { TrufflehogScanner } from './trufflehog.scanner';

@Module({ imports: [ScannerSdkModule] })
export class TrufflehogScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(TrufflehogScanner.name)) {
      this.registry.register(TrufflehogScanner);
    }
  }
}
