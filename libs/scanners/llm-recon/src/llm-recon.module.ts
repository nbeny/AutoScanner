import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { LlmReconScanner } from './llm-recon.scanner';

@Module({ imports: [ScannerSdkModule] })
export class LlmReconScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(LlmReconScanner.name)) {
      this.registry.register(LlmReconScanner);
    }
  }
}
