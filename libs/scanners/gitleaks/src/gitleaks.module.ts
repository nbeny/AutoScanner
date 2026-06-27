import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { GitleaksScanner } from './gitleaks.scanner';

@Module({ imports: [ScannerSdkModule] })
export class GitleaksScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(GitleaksScanner.name)) {
      this.registry.register(GitleaksScanner);
    }
  }
}
