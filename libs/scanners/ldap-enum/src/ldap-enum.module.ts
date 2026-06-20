import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { LdapEnumScanner } from './ldap-enum.scanner';

@Module({ imports: [ScannerSdkModule] })
export class LdapEnumScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(LdapEnumScanner.name)) {
      this.registry.register(LdapEnumScanner);
    }
  }
}
