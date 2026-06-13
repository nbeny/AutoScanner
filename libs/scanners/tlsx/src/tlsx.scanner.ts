import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const TlsxInput = z.object({});

export type TlsxInputType = z.infer<typeof TlsxInput>;

export const TlsxScanner: ScannerDefinition<TlsxInputType> = {
  name: 'tlsx',
  displayName: 'tlsx',
  category: [ScannerCategory.SSL_TLS],
  description: 'TLS certificate and fingerprint scanner (ProjectDiscovery).',
  inputSchema: TlsxInput,
  docker: {
    image: 'projectdiscovery/tlsx:v1.2.2',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(_input, target) {
    return {
      cmd: [
        'tlsx',
        '-u',
        target,
        '-json',
        '-silent',
        '-san',
        '-cn',
        '-so',
        '-ex',
        '-re',
        '-tls-version',
      ],
    };
  },
  outputs: [{ format: 'JSONL', capture: 'stdout', parser: 'tlsx-json' }],
  produces: ['TlsCertificate', 'Finding'],
};
