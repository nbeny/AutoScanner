import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const SubzyInput = z.object({
  /** Only test the HTTPS scheme (faster; skips http:// probing). */
  httpsOnly: z.boolean().default(false),
});
export type SubzyInputType = z.infer<typeof SubzyInput>;

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export const SubzyScanner: ScannerDefinition<SubzyInputType> = {
  name: 'subzy',
  displayName: 'Subzy (subdomain takeover)',
  category: [ScannerCategory.SUBDOMAIN_ENUM, ScannerCategory.VULN_SCAN],
  description:
    'Detects dangling-CNAME subdomain takeovers via subzy service fingerprints. ' +
    'Sends light HTTP requests to the target host.',
  inputSchema: SubzyInput,
  docker: {
    image: 'autoscanner/subzy:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(input, target, ctx) {
    const out = `${ctx.scratchDir}/subzy.json`;
    const https = input.httpsOnly ? ' --https' : '';
    // --hide_fails: only emit confirmed/likely-vulnerable results to the JSON file.
    // `|| true`: subzy exits non-zero when nothing is vulnerable; the artifact file is
    // the real success signal (matches the gowitness/nikto pattern).
    const script =
      `subzy run --target ${shellQuoteSingle(target)} ` +
      `--output ${out} --hide_fails${https} || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'JSON', capture: { path: 'subzy.json' }, parser: 'subzy-json' }],
  produces: ['Finding'],
};
