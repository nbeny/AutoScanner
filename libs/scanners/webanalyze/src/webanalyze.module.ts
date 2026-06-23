import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { WebanalyzeScanner } from './webanalyze.scanner';

@Module({ imports: [ScannerSdkModule] })
export class WebanalyzeScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(WebanalyzeScanner.name)) {
      this.registry.register(WebanalyzeScanner);
    }
  }
}
