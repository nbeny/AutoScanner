import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { MantraScanner } from './mantra.scanner';

@Module({ imports: [ScannerSdkModule] })
export class MantraScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}
  onModuleInit(): void {
    if (!this.registry.has(MantraScanner.name)) {
      this.registry.register(MantraScanner);
    }
  }
}
