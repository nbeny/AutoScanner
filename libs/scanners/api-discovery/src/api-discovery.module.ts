import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { ApiDiscoveryScanner } from './api-discovery.scanner';

@Module({ imports: [ScannerSdkModule] })
export class ApiDiscoveryScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(ApiDiscoveryScanner.name)) {
      this.registry.register(ApiDiscoveryScanner);
    }
  }
}
