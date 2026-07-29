import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { LlmAttackScanner } from './llm-attack.scanner';

@Module({ imports: [ScannerSdkModule] })
export class LlmAttackScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(LlmAttackScanner.name)) {
      this.registry.register(LlmAttackScanner);
    }
  }
}
