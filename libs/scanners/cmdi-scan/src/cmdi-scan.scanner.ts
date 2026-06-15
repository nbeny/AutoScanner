import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const CmdiScanInput = z.object({
  level: z.enum(['detect', 'aggressive']).default('detect'),
});
export type CmdiScanInputType = z.infer<typeof CmdiScanInput>;

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export const CmdiScanScanner: ScannerDefinition<CmdiScanInputType> = {
  name: 'cmdi-scan',
  displayName: 'Command injection scan (commix)',
  category: [ScannerCategory.VULN_SCAN, ScannerCategory.WEB_ENUM],
  description:
    'Active OS command-injection detection with commix. Detection only (no --os-cmd / no shell). Actively probes the target.',
  inputSchema: CmdiScanInput,
  docker: {
    image: 'autoscanner/cmdi-scan:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: false,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(input, target) {
    const t = shellQuoteSingle(target);
    const depth = input.level === 'aggressive' ? '--level 2' : '--level 1';
    const script = `commix --url=${t} --batch ${depth} 2>/dev/null || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'commix-text' }],
  produces: ['Finding'],
};
