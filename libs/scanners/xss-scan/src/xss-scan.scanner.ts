import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory, authHeaderLines } from '@autoscanner/scanner-sdk';

const XssScanInput = z.object({
  level: z.enum(['detect', 'aggressive']).default('detect'),
});
export type XssScanInputType = z.infer<typeof XssScanInput>;

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export const XssScanScanner: ScannerDefinition<XssScanInputType> = {
  name: 'xss-scan',
  displayName: 'XSS scan (dalfox)',
  category: [ScannerCategory.VULN_SCAN, ScannerCategory.WEB_ENUM],
  description:
    'Active reflected/DOM XSS scanning with dalfox. Detection/PoC only by default (no blind-XSS callback). Actively probes the target.',
  inputSchema: XssScanInput,
  docker: {
    image: 'ghcr.io/hahwul/dalfox:v2.9.4',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(input, target, ctx) {
    const t = shellQuoteSingle(target);
    const flags = ['--format', 'json', '--no-color', '--silence'];
    if (input.level === 'aggressive') flags.push('--mining-dom', '--deep-domxss');
    // Authenticated XSS: dalfox takes repeatable -H 'Name: Value'. No-op when
    // no auth is configured.
    for (const h of authHeaderLines(ctx.auth)) flags.push('-H', shellQuoteSingle(h));
    const script = `dalfox url ${t} ${flags.join(' ')} 2>/dev/null || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'JSON', capture: 'stdout', parser: 'dalfox-json' }],
  produces: ['Finding'],
};
