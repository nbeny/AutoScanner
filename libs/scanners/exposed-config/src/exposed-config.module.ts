import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { ExposedConfigScanner } from './exposed-config.scanner';

@Module({ imports: [ScannerSdkModule] })
export class ExposedConfigScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}
  onModuleInit(): void {
    if (!this.registry.has(ExposedConfigScanner.name)) {
      this.registry.register(ExposedConfigScanner);
    }
  }
}
