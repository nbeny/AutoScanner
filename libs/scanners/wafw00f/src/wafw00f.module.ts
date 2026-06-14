import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { Wafw00fScanner } from './wafw00f.scanner';

@Module({ imports: [ScannerSdkModule] })
export class Wafw00fScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(Wafw00fScanner.name)) {
      this.registry.register(Wafw00fScanner);
    }
  }
}
