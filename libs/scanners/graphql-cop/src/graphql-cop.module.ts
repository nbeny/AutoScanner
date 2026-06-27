import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { GraphqlCopScanner } from './graphql-cop.scanner';

@Module({ imports: [ScannerSdkModule] })
export class GraphqlCopScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(GraphqlCopScanner.name)) {
      this.registry.register(GraphqlCopScanner);
    }
  }
}
