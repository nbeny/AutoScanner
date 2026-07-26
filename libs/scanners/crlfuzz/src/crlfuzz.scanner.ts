import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory, authHeaderLines } from '@autoscanner/scanner-sdk';

const CrlfuzzInput = z.object({
  concurrency: z.number().int().min(1).max(50).default(25),
});
export type CrlfuzzInputType = z.infer<typeof CrlfuzzInput>;

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export const CrlfuzzScanner: ScannerDefinition<CrlfuzzInputType> = {
  name: 'crlfuzz',
  displayName: 'CRLF injection (crlfuzz)',
  category: [ScannerCategory.VULN_SCAN, ScannerCategory.WEB_ENUM],
  description:
    'Actively probes a URL for CRLF injection / HTTP response splitting with crlfuzz. ' +
    'Reports each parameter/path where an injected CRLF sequence is reflected into response headers.',
  inputSchema: CrlfuzzInput,
  docker: {
    image: 'autoscanner/crlfuzz:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(input, target, ctx) {
    const flags = ['-u', shellQuoteSingle(target), '-s', '-c', String(input.concurrency)];
    // Authenticated scans: crlfuzz takes repeatable -H 'Name: Value'. No-op when unauthenticated.
    for (const h of authHeaderLines(ctx.auth)) flags.push('-H', shellQuoteSingle(h));
    const script = `crlfuzz ${flags.join(' ')} 2>/dev/null || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'crlfuzz-text' }],
  produces: ['Finding'],
};
