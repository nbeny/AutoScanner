import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { OauthOidcScanner } from './oauth-oidc.scanner';

@Module({ imports: [ScannerSdkModule] })
export class OauthOidcScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(OauthOidcScanner.name)) {
      this.registry.register(OauthOidcScanner);
    }
  }
}
