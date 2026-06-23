import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

const SstiScanInput = z.object({
  /** detect = confirm injection only. exploit = let SSTImap attempt eval/RCE confirmation. */
  level: z.enum(['detect', 'exploit']).default('detect'),
});
export type SstiScanInputType = z.infer<typeof SstiScanInput>;

export const SstiScanScanner: ScannerDefinition<SstiScanInputType> = {
  name: 'ssti-scan',
  displayName: 'Server-side template injection (SSTImap)',
  category: [ScannerCategory.VULN_SCAN, ScannerCategory.WEB_ENUM],
  description:
    'Active SSTI detection and engine fingerprinting with SSTImap. Detection only by default; ' +
    'exploit level adds eval confirmation. Actively probes the target.',
  inputSchema: SstiScanInput,
  docker: {
    image: 'autoscanner/ssti-scan:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: false,
    memoryLimitMb: 768,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(input, target) {
    const t = shellQuoteSingle(target);
    const evalFlag = input.level === 'exploit' ? '--eval' : '';
    // SSTImap runs non-interactively when given -u and no interactive action.
    // `|| true` keeps a clean exit 0 on "no injection found".
    const script = `python3 /opt/SSTImap/sstimap.py -u ${t} ${evalFlag} 2>/dev/null || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'sstimap-text' }],
  produces: ['Finding'],
};
