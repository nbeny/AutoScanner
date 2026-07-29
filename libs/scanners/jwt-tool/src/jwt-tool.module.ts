import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { JwtToolScanner } from './jwt-tool.scanner';

@Module({ imports: [ScannerSdkModule] })
export class JwtToolScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(JwtToolScanner.name)) {
      this.registry.register(JwtToolScanner);
    }
  }
}
