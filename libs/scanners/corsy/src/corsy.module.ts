import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { CorsyScanner } from './corsy.scanner';

@Module({ imports: [ScannerSdkModule] })
export class CorsyScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(CorsyScanner.name)) {
      this.registry.register(CorsyScanner);
    }
  }
}
