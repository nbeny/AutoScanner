import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const Wafw00fInput = z.object({});
export type Wafw00fInputType = z.infer<typeof Wafw00fInput>;

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export const Wafw00fScanner: ScannerDefinition<Wafw00fInputType> = {
  name: 'wafw00f',
  displayName: 'wafw00f (WAF detection)',
  category: [ScannerCategory.WEB_FINGERPRINT],
  description:
    'Detects the Web Application Firewall in front of a host. Actively probes the target.',
  inputSchema: Wafw00fInput,
  docker: {
    image: 'autoscanner/wafw00f:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 180_000,
  },
  build(_input, target) {
    const script = `wafw00f ${shellQuoteSingle(target)} -f json -o /dev/stdout 2>/dev/null || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'JSON', capture: 'stdout', parser: 'wafw00f-json' }],
  produces: ['Technology'],
};
