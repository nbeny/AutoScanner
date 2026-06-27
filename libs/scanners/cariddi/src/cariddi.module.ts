import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { CariddiScanner } from './cariddi.scanner';

@Module({ imports: [ScannerSdkModule] })
export class CariddiScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(CariddiScanner.name)) {
      this.registry.register(CariddiScanner);
    }
  }
}
