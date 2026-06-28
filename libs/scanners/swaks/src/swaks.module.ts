import { Module } from '@nestjs/common';
import { ScannerSdkModule, type ScannerRegistry } from '@autoscanner/scanner-sdk';
import { SwaksScanner } from './swaks.scanner';

@Module({
  imports: [ScannerSdkModule],
})
export class SwaksScannerModule {
  constructor(registry: ScannerRegistry) {
    if (!registry.has('swaks')) {
      registry.register(SwaksScanner);
    }
  }
}
