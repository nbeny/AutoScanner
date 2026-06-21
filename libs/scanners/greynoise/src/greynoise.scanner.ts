import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const GreynoiseInput = z.object({});
export type GreynoiseInputType = z.infer<typeof GreynoiseInput>;

export const GreynoiseScanner: ScannerDefinition<GreynoiseInputType> = {
  name: 'greynoise',
  displayName: 'GreyNoise',
  category: [ScannerCategory.PASSIVE_RECON, ScannerCategory.OSINT],
  description:
    'Queries the GreyNoise community API to determine if an IP is a known internet scanner ' +
    'or has been classified as malicious. No API key required (community endpoint). ' +
    'Emits CRITICAL for malicious, MEDIUM for noisy scanner, INFO for benign/RIOT.',
  inputSchema: GreynoiseInput,
  docker: {
    image: 'autoscanner/greynoise:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 128,
    cpuQuota: 500_000,
    defaultTimeoutMs: 30_000,
  },
  build(_input, target) {
    return { cmd: ['python3', '/usr/local/bin/check.py', target] };
  },
  outputs: [{ format: 'JSON', capture: 'stdout', parser: 'greynoise-json' }],
  produces: ['Finding'],
};
