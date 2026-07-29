import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { H8mailScanner } from './h8mail.scanner';

@Module({ imports: [ScannerSdkModule] })
export class H8mailScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}
  onModuleInit(): void {
    if (!this.registry.has(H8mailScanner.name)) {
      this.registry.register(H8mailScanner);
    }
  }
}
