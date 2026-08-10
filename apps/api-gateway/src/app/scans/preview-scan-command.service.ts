import { Inject, Injectable } from '@nestjs/common';
import { injectExtraArgs, sanitizeExtraArgs, ScannerRegistry } from '@autoscanner/scanner-sdk';

import { ScanCommandPreview } from './dto/scan-command-preview.object';

/**
 * Computes the exact command a scanner would run — WITHOUT executing anything —
 * by mirroring the scan-worker build sequence: validate options through the
 * scanner's Zod inputSchema, call build() with a stub context (no real
 * credentials/OAST), then inject extraArgs the same way the run path does. Pure
 * and registry-only; credential VALUES never appear in argv (they go via env).
 */
@Injectable()
export class PreviewScanCommandService {
  constructor(@Inject(ScannerRegistry) private readonly registry: ScannerRegistry) {}

  preview(scannerName: string, target: string, optionsJson?: string): ScanCommandPreview {
    const scanner = this.registry.get(scannerName); // throws "not found" for unknown names

    let rawInput: Record<string, unknown> = {};
    if (optionsJson && optionsJson.trim()) {
      try {
        rawInput = JSON.parse(optionsJson) as Record<string, unknown>;
      } catch {
        return { image: scanner.docker.image, argv: [], note: 'optionsJson invalide (JSON).' };
      }
    }

    const extraArgs = sanitizeExtraArgs(rawInput['extraArgs']);

    try {
      const parsedInput = scanner.inputSchema.parse(rawInput);
      const build = scanner.build(parsedInput, target, {
        scanJobId: 'preview',
        engagementId: 'preview',
        scratchDir: '/output',
        oast: { serverUrl: '{{OAST}}' },
        auth: {},
      });
      const argv = injectExtraArgs(build.cmd, extraArgs);
      const note = scanner.requiresCredential
        ? `Nécessite une clé API (${scanner.requiresCredential}), injectée à l'exécution.`
        : null;
      return { image: scanner.docker.image, argv, note };
    } catch (err) {
      return { image: scanner.docker.image, argv: [], note: (err as Error).message };
    }
  }
}
