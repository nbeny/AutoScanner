import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

export const TheHarvesterScanner: ScannerDefinition<Record<string, never>> = {
  name: 'theharvester',
  displayName: 'theHarvester',
  category: [ScannerCategory.OSINT, ScannerCategory.PASSIVE_RECON],
  description:
    'OSINT email and host gathering via theHarvester. ' +
    'Queries crtsh, bing, duckduckgo and OTX; extracts emails from stdout.',
  inputSchema: z.object({}),
  docker: {
    image: 'autoscanner/theharvester:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: false,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(_input, target) {
    return { cmd: ['theHarvester', '-d', target, '-b', 'crtsh,bing,duckduckgo,otx'] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'theharvester-text' }],
  produces: ['Email'],
};
