import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { GithubSubdomainsScanner } from './github-subdomains.scanner';

@Module({ imports: [ScannerSdkModule] })
export class GithubSubdomainsScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(GithubSubdomainsScanner.name)) {
      this.registry.register(GithubSubdomainsScanner);
    }
  }
}
