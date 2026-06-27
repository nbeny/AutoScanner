import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { Graphw00fScanner } from './graphw00f.scanner';

@Module({ imports: [ScannerSdkModule] })
export class Graphw00fScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(Graphw00fScanner.name)) {
      this.registry.register(Graphw00fScanner);
    }
  }
}
