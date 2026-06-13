import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const WhoisInput = z.object({});

export type WhoisInputType = z.infer<typeof WhoisInput>;

export const WhoisScanner: ScannerDefinition<WhoisInputType> = {
  name: 'whois',
  displayName: 'whois',
  category: [ScannerCategory.OSINT, ScannerCategory.PASSIVE_RECON],
  description:
    'WHOIS domain registration lookup. Extracts registrar, organization, and contact emails.',
  inputSchema: WhoisInput,
  docker: {
    // Built locally via tools/scanners/build-images.sh — not on a registry.
    image: 'autoscanner/whois:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 256,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 120_000,
  },
  build(_input, target) {
    return { cmd: ['whois', target] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'whois-text' }],
  produces: ['Email', 'OrgMetadata'],
};
