import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const OralyzerInput = z.object({});
export type OralyzerInputType = z.infer<typeof OralyzerInput>;

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export const OralyzerScanner: ScannerDefinition<OralyzerInputType> = {
  name: 'oralyzer',
  displayName: 'Open redirect (oralyzer)',
  category: [ScannerCategory.VULN_SCAN, ScannerCategory.WEB_ENUM],
  description:
    'Actively probes a URL for open redirection with Oralyzer, fuzzing a bundled payload list ' +
    'and reporting parameters whose redirect target can be controlled.',
  inputSchema: OralyzerInput,
  docker: {
    image: 'autoscanner/oralyzer:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(_input, target, _ctx) {
    const script = `oralyzer -u ${shellQuoteSingle(target)} 2>/dev/null || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'oralyzer-text' }],
  produces: ['Finding'],
};
