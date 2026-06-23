import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const SqliScanInput = z.object({
  level: z.enum(['detect', 'aggressive']).default('detect'),
});
export type SqliScanInputType = z.infer<typeof SqliScanInput>;

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export const SqliScanScanner: ScannerDefinition<SqliScanInputType> = {
  name: 'sqli-scan',
  displayName: 'SQL injection scan (sqlmap)',
  category: [ScannerCategory.VULN_SCAN, ScannerCategory.WEB_ENUM],
  description:
    'Active SQL-injection detection with sqlmap. Detection only by default (no --dump / no shell). Actively probes the target.',
  inputSchema: SqliScanInput,
  docker: {
    image: 'autoscanner/sqli-scan:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: false,
    memoryLimitMb: 768,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(input, target, ctx) {
    const t = shellQuoteSingle(target);
    const depth = input.level === 'aggressive' ? '--level 3 --risk 2' : '--level 1 --risk 1';
    // Authenticated SQLi: pass the session cookie via sqlmap's native --cookie
    // (sqlmap uses --cookie/--headers, not -H). No-op when no auth is configured.
    const cookie = ctx.auth?.cookie ? ` --cookie=${shellQuoteSingle(ctx.auth.cookie)}` : '';
    const script = `sqlmap -u ${t} --batch ${depth} --technique=BEU --flush-session${cookie} 2>/dev/null || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'sqlmap-json' }],
  produces: ['Finding'],
};
