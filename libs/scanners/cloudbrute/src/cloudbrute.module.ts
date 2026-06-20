import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { CloudbruteScanner } from './cloudbrute.scanner';

@Module({ imports: [ScannerSdkModule] })
export class CloudbruteScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(CloudbruteScanner.name)) {
      this.registry.register(CloudbruteScanner);
    }
  }
}
