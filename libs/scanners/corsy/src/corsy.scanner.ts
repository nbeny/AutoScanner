import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const HEADER_KEY = /^[A-Za-z0-9-]+$/;

const CorsyInput = z.object({
  urls: z.array(z.string().url()).default([]),
  threads: z.number().int().min(1).max(32).default(8),
  headers: z.record(z.string().regex(HEADER_KEY), z.string()).default({}),
});
export type CorsyInputType = z.infer<typeof CorsyInput>;

function shEscape(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export const CorsyScanner: ScannerDefinition<CorsyInputType> = {
  name: 'corsy',
  displayName: 'corsy',
  category: [ScannerCategory.WEB_ENUM, ScannerCategory.VULN_SCAN],
  description:
    'CORS misconfiguration scanner (s0md3v/Corsy). Reads URL list, classifies misconfigs ' +
    'into 5 categories from CRITICAL to LOW.',
  inputSchema: CorsyInput,
  docker: {
    image: 'autoscanner/corsy:1.0',
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
    const headerArgs = Object.entries(input.headers)
      .map(([k, v]) => `-H ${shEscape(`${k}: ${v}`)}`)
      .join(' ');
    const corsy = `corsy -i /tmp/urls.txt -t ${input.threads} -o /out/result.json${headerArgs ? ' ' + headerArgs : ''}`;
    const script = `printf '%s\\n' ${urlArgs} > /tmp/urls.txt && ${corsy}`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'JSON', capture: { path: '/out/result.json' }, parser: 'corsy-json' }],
  produces: ['Finding'],
};
