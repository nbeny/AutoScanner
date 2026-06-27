import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { FofaScanner } from './fofa.scanner';

@Module({ imports: [ScannerSdkModule] })
export class FofaScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(FofaScanner.name)) {
      this.registry.register(FofaScanner);
    }
  }
}
