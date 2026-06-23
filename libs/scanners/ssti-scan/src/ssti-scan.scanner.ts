import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory, authHeaderLines } from '@autoscanner/scanner-sdk';

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
  build(input, target, ctx) {
    const t = shellQuoteSingle(target);
    // exploit level adds a non-interactive eval confirmation via --eval-code
    // (SSTImap has no `--eval`; -x/-s/-t are INTERACTIVE shells that would hang
    // a container). `str(7*7)` runs only if the engine is injectable.
    const evalFlag = input.level === 'exploit' ? `--eval-code ${shellQuoteSingle('str(7*7)')}` : '';
    // Authenticated SSTI: SSTImap takes repeatable -H 'Name: Value'. No-op when
    // no auth is configured.
    const headerArgs = authHeaderLines(ctx.auth)
      .map((h) => `-H ${shellQuoteSingle(h)}`)
      .join(' ');
    // `--no-color` keeps ANSI escapes out of the captured output. SSTImap runs
    // non-interactively with -u and no interactive action; `|| true` keeps a
    // clean exit 0 on "no injection found". Extra spaces are harmless to sh.
    const script = `python3 /opt/SSTImap/sstimap.py -u ${t} --no-color ${evalFlag} ${headerArgs} 2>/dev/null || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'sstimap-text' }],
  produces: ['Finding'],
};
