import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { CloudEnumScanner } from './cloud-enum.scanner';

@Module({ imports: [ScannerSdkModule] })
export class CloudEnumScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(CloudEnumScanner.name)) {
      this.registry.register(CloudEnumScanner);
    }
  }
}
