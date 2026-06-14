import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const ApiDiscoveryInput = z.object({});
export type ApiDiscoveryInputType = z.infer<typeof ApiDiscoveryInput>;

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export const ApiDiscoveryScanner: ScannerDefinition<ApiDiscoveryInputType> = {
  name: 'api-discovery',
  displayName: 'API discovery (kiterunner)',
  category: [ScannerCategory.API_SECURITY, ScannerCategory.WEB_ENUM],
  description:
    'Brute-forces hidden API routes with an API wordlist (kiterunner). Actively probes the target.',
  inputSchema: ApiDiscoveryInput,
  docker: {
    image: 'autoscanner/api-discovery:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 768,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(_input, target) {
    const t = shellQuoteSingle(target);
    const script = `kr scan ${t} -w /wordlists/routes-small.kite -x 10 -j 50 --fail-status-codes 400,404 2>/dev/null || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'kiterunner-text' }],
  produces: ['Endpoint'],
};
