import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { S3scannerScanner } from './s3scanner.scanner';

@Module({ imports: [ScannerSdkModule] })
export class S3scannerScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(S3scannerScanner.name)) {
      this.registry.register(S3scannerScanner);
    }
  }
}
