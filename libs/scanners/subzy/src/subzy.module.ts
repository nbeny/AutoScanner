import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { SubzyScanner } from './subzy.scanner';

@Module({ imports: [ScannerSdkModule] })
export class SubzyScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(SubzyScanner.name)) {
      this.registry.register(SubzyScanner);
    }
  }
}
