import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const SslscanInput = z.object({});

export type SslscanInputType = z.infer<typeof SslscanInput>;

export const SslscanScanner: ScannerDefinition<SslscanInputType> = {
  name: 'sslscan',
  displayName: 'sslscan',
  category: [ScannerCategory.SSL_TLS],
  description:
    'TLS/SSL cipher suite and protocol scanner. Detects weak protocols (SSLv2/3, TLSv1.0/1.1) and weak ciphers (RC4, NULL, EXPORT, DES, MD5, anon).',
  inputSchema: SslscanInput,
  docker: {
    // Built locally via tools/scanners/build-images.sh — not on a registry.
    image: 'autoscanner/sslscan:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 256,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(_input, target) {
    return { cmd: ['sslscan', '--no-colour', target] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'sslscan-text' }],
  produces: ['Finding'],
};
