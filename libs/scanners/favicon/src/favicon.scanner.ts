import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const FaviconInput = z.object({});
export type FaviconInputType = z.infer<typeof FaviconInput>;

export const FaviconScanner: ScannerDefinition<FaviconInputType> = {
  name: 'favicon',
  displayName: 'Favicon hash (httpx)',
  category: [ScannerCategory.WEB_FINGERPRINT],
  description:
    'Computes the mmh3 favicon hash of a web host (httpx -favicon) for technology fingerprinting and pivoting. Actively probes the target.',
  inputSchema: FaviconInput,
  docker: {
    image: 'projectdiscovery/httpx:v1.9.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(_input, target) {
    return { cmd: ['httpx', '-favicon', '-json', '-silent', '-nc'], stdin: target };
  },
  outputs: [{ format: 'JSONL', capture: 'stdout', parser: 'favicon-json' }],
  produces: ['Technology'],
};
