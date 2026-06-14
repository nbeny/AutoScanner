import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { SmtpReconScanner } from './smtp-recon.scanner';

@Module({ imports: [ScannerSdkModule] })
export class SmtpReconScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(SmtpReconScanner.name)) {
      this.registry.register(SmtpReconScanner);
    }
  }
}
