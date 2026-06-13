import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const WhatwwebInput = z.object({});

export type WhatwwebInputType = z.infer<typeof WhatwwebInput>;

export const WhatwwebScanner: ScannerDefinition<WhatwwebInputType> = {
  name: 'whatweb',
  displayName: 'WhatWeb',
  category: [ScannerCategory.WEB_FINGERPRINT],
  description: 'Web technology fingerprinter (WhatWeb). Custom-built image.',
  inputSchema: WhatwwebInput,
  docker: {
    // Built locally via tools/scanners/build-images.sh — not on a registry.
    image: 'autoscanner/whatweb:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: false,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(_input, target) {
    return { cmd: ['whatweb', '--quiet', '--no-errors', '--log-json=/dev/stdout', target] };
  },
  outputs: [{ format: 'JSON', capture: 'stdout', parser: 'whatweb-json' }],
  produces: ['Technology'],
};
