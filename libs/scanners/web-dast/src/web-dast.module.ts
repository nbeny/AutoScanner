import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { WebDastScanner } from './web-dast.scanner';

@Module({ imports: [ScannerSdkModule] })
export class WebDastScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(WebDastScanner.name)) {
      this.registry.register(WebDastScanner);
    }
  }
}
