import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { GcpBucketBruteScanner } from './gcp-bucket-brute.scanner';

@Module({ imports: [ScannerSdkModule] })
export class GcpBucketBruteScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(GcpBucketBruteScanner.name)) {
      this.registry.register(GcpBucketBruteScanner);
    }
  }
}
