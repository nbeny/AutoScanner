import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { PhoneinfogaScanner } from './phoneinfoga.scanner';

@Module({ imports: [ScannerSdkModule] })
export class PhoneinfogaScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(PhoneinfogaScanner.name)) {
      this.registry.register(PhoneinfogaScanner);
    }
  }
}
