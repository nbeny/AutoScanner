import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const WaymoreInput = z.object({
  /** U = URLs only (fast); R = also download archived responses (heavy). */
  mode: z.enum(['U', 'R']).default('U'),
});
export type WaymoreInputType = z.infer<typeof WaymoreInput>;

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export const WaymoreScanner: ScannerDefinition<WaymoreInputType> = {
  name: 'waymore',
  displayName: 'Waymore (archive URL harvest)',
  category: [ScannerCategory.WEB_ENUM, ScannerCategory.PASSIVE_RECON],
  description:
    'Harvests historical URLs for the target from multiple public archive sources ' +
    '(Wayback Machine, Common Crawl, URLScan public). Key-only sources are skipped.',
  inputSchema: WaymoreInput,
  docker: {
    image: 'autoscanner/waymore:1.0',
    network: 'bridge',
    capabilities: [],
    // waymore writes its config + cache under $HOME; needs a writable rootfs.
    readonlyRootfs: false,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(input, target, ctx) {
    const out = `${ctx.scratchDir}/waymore.txt`;
    const script = `waymore -i ${shellQuoteSingle(target)} -mode ${input.mode} -oU ${out} || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'TEXT', capture: { path: 'waymore.txt' }, parser: 'urllines-text' }],
  produces: ['Endpoint'],
};
