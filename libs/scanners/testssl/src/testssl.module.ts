import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { TestsslScanner } from './testssl.scanner';

@Module({ imports: [ScannerSdkModule] })
export class TestsslScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(TestsslScanner.name)) {
      this.registry.register(TestsslScanner);
    }
  }
}
