import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const MantraInput = z.object({
  urls: z.array(z.string().url()).default([]),
});
export type MantraInputType = z.infer<typeof MantraInput>;

function shEscape(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export const MantraScanner: ScannerDefinition<MantraInputType> = {
  name: 'mantra',
  displayName: 'Mantra',
  category: [ScannerCategory.VULN_SCAN, ScannerCategory.WEB_ENUM],
  description:
    'Hunts API keys and secrets in live HTTP responses and JavaScript (Brosck/mantra). ' +
    'Reads a URL list and reports secrets discovered in the fetched content.',
  inputSchema: MantraInput,
  docker: {
    image: 'autoscanner/mantra:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(input, target) {
    const urls = input.urls.length > 0 ? input.urls : [target];
    const urlArgs = urls.map(shEscape).join(' ');
    const script = `printf '%s\\n' ${urlArgs} > /tmp/urls.txt && cat /tmp/urls.txt | mantra > /out/result.txt 2>&1`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'TEXT', capture: { path: '/out/result.txt' }, parser: 'mantra-text' }],
  produces: ['Finding'],
};
