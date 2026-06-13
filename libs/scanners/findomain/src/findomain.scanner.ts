import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const FindomainInput = z.object({});

export type FindomainInputType = z.infer<typeof FindomainInput>;

export const FindomainScanner: ScannerDefinition<FindomainInputType> = {
  name: 'findomain',
  displayName: 'Findomain',
  category: [ScannerCategory.SUBDOMAIN_ENUM, ScannerCategory.PASSIVE_RECON],
  description: 'Fast passive subdomain enumeration (findomain).',
  inputSchema: FindomainInput,
  docker: {
    // Pinned. If this tag 404s, pick the latest stable from
    // https://github.com/Findomain/Findomain/releases and update here + CI.
    image: 'edu4rdshl/findomain:9.0.4',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(_input, target) {
    return { cmd: ['findomain', '--target', target, '--quiet'] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'hostlines-text' }],
  produces: ['Asset', 'Subdomain'],
};
