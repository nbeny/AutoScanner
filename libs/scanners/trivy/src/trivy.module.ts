import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { TrivyScanner } from './trivy.scanner';

@Module({ imports: [ScannerSdkModule] })
export class TrivyScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(TrivyScanner.name)) {
      this.registry.register(TrivyScanner);
    }
  }
}
