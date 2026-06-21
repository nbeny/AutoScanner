import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { SshAuditScanner } from './ssh-audit.scanner';

@Module({ imports: [ScannerSdkModule] })
export class SshAuditScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}
  onModuleInit(): void {
    if (!this.registry.has(SshAuditScanner.name)) {
      this.registry.register(SshAuditScanner);
    }
  }
}
