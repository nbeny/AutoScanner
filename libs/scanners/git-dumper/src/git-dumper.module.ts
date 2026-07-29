import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { GitDumperScanner } from './git-dumper.scanner';

@Module({ imports: [ScannerSdkModule] })
export class GitDumperScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}
  onModuleInit(): void {
    if (!this.registry.has(GitDumperScanner.name)) {
      this.registry.register(GitDumperScanner);
    }
  }
}
