import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

const ZapScanInput = z.object({
  /** baseline = passive spider only (fast, safe). full = spider + active attack (intensive). */
  mode: z.enum(['baseline', 'full']).default('baseline'),
});
export type ZapScanInputType = z.infer<typeof ZapScanInput>;

export const ZapScanScanner: ScannerDefinition<ZapScanInputType> = {
  name: 'zap-scan',
  displayName: 'OWASP ZAP (DAST engine)',
  category: [ScannerCategory.VULN_SCAN, ScannerCategory.WEB_ENUM],
  description:
    'Unified DAST engine (OWASP ZAP). baseline = passive spider; full = spider + active ' +
    'attack across many vuln classes. Writes a JSON report. Actively probes the target.',
  inputSchema: ZapScanInput,
  docker: {
    // Version-sensitive — verify the tag against current ZAP releases at deploy.
    image: 'ghcr.io/zaproxy/zaproxy:2.15.0',
    network: 'bridge',
    capabilities: [],
    // ZAP writes extensive state under /zap and /home/zap; needs a writable rootfs.
    readonlyRootfs: false,
    memoryLimitMb: 2048,
    cpuQuota: 2_000_000,
    defaultTimeoutMs: 1_800_000,
  },
  build(input, target, ctx) {
    const flavor = input.mode === 'full' ? 'zap-full-scan.py' : 'zap-baseline.py';
    const out = `${ctx.scratchDir}/zap.json`;
    // `-I` keeps ZAP from returning a non-zero exit on warnings; `|| true` covers
    // the active-scan exit codes. The produced report file is the real success
    // signal (the worker fails the job if no artifact is written). ZAP writes the
    // -J report to its working dir (/zap/wrk); copy it into the captured scratchDir.
    const script =
      `${flavor} -t ${shellQuoteSingle(target)} -J zap.json -I || true; ` +
      `cp /zap/wrk/zap.json ${out} 2>/dev/null || cp ./zap.json ${out} 2>/dev/null || true; true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'JSON', capture: { path: 'zap.json' }, parser: 'zap-json' }],
  produces: ['Finding'],
};
