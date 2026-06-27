import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const HEADER_KEY = /^[A-Za-z0-9-]+$/;

const KiterunnerInput = z.object({
  urls: z.array(z.string().url()).default([]),
  maxConnPerHost: z.number().int().min(1).max(50).default(3),
  quarantineThreshold: z.number().int().min(1).max(100).default(10),
  headers: z.record(z.string().regex(HEADER_KEY), z.string()).default({}),
});
export type KiterunnerInputType = z.infer<typeof KiterunnerInput>;

function shEscape(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export const KiterunnerScanner: ScannerDefinition<KiterunnerInputType> = {
  name: 'kiterunner',
  displayName: 'kiterunner (deep, large wordlist)',
  category: [ScannerCategory.WEB_ENUM, ScannerCategory.API_SECURITY],
  description:
    'Deep API endpoint brute (assetnote/kiterunner) with the routes-large.kite wordlist (~970k routes). ' +
    'Exposes max-connection-per-host, quarantine-threshold and custom headers. Pair with api-discovery ' +
    '(small wordlist, zero-config) for quick scans.',
  inputSchema: KiterunnerInput,
  docker: {
    image: 'autoscanner/kiterunner:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 2048,
    cpuQuota: 2_000_000,
    defaultTimeoutMs: 1_800_000,
  },
  build(input, target) {
    const urls = input.urls.length > 0 ? input.urls : [target];
    const urlArgs = urls.map(shEscape).join(' ');
    const headerArgs = Object.entries(input.headers)
      .map(([k, v]) => `-H ${shEscape(`${k}: ${v}`)}`)
      .join(' ');
    const kr = [
      'kr scan /tmp/urls.txt',
      '-w /opt/wordlists/routes-large.kite',
      `--max-connection-per-host ${input.maxConnPerHost}`,
      `--quarantine-threshold ${input.quarantineThreshold}`,
      headerArgs,
    ]
      .filter((s) => s.length > 0)
      .join(' ');
    const script = `printf '%s\\n' ${urlArgs} > /tmp/urls.txt && ${kr}`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'kiterunner-text' }],
  produces: ['Endpoint', 'Finding'],
};
