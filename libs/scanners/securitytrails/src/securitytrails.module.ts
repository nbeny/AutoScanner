import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { SecuritytrailsScanner } from './securitytrails.scanner';

@Module({ imports: [ScannerSdkModule] })
export class SecuritytrailsScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(SecuritytrailsScanner.name)) {
      this.registry.register(SecuritytrailsScanner);
    }
  }
}
