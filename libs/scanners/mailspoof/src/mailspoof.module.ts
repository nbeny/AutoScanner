import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { MailspoofScanner } from './mailspoof.scanner';

@Module({ imports: [ScannerSdkModule] })
export class MailspoofScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(MailspoofScanner.name)) {
      this.registry.register(MailspoofScanner);
    }
  }
}
