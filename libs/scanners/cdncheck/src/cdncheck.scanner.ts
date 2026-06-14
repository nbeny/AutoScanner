import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const CdncheckInput = z.object({});
export type CdncheckInputType = z.infer<typeof CdncheckInput>;

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export const CdncheckScanner: ScannerDefinition<CdncheckInputType> = {
  name: 'cdncheck',
  displayName: 'cdncheck (CDN/cloud)',
  category: [ScannerCategory.WEB_FINGERPRINT, ScannerCategory.NETWORK_DISCOVERY],
  description:
    'Identifies whether a host/IP is behind a CDN, WAF or cloud provider (ProjectDiscovery cdncheck).',
  inputSchema: CdncheckInput,
  docker: {
    image: 'autoscanner/cdncheck:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 256,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 120_000,
  },
  build(_input, target) {
    const script = `echo ${shellQuoteSingle(target)} | cdncheck -json -silent 2>/dev/null || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'JSONL', capture: 'stdout', parser: 'cdncheck-json' }],
  produces: ['Technology'],
};
