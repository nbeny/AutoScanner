import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const FeroxbusterInput = z.object({
  wordlist: z.string().default('/etc/feroxbuster/wordlist.txt'),
  depth: z.number().int().min(1).max(10).default(2),
  extensions: z.array(z.string().regex(/^[a-zA-Z0-9]{1,6}$/)).default([]),
  filterStatus: z.array(z.number().int().min(100).max(599)).default([]),
});
export type FeroxbusterInputType = z.infer<typeof FeroxbusterInput>;

export const FeroxbusterScanner: ScannerDefinition<FeroxbusterInputType> = {
  name: 'feroxbuster',
  displayName: 'feroxbuster',
  category: [ScannerCategory.WEB_ENUM, ScannerCategory.WEB_FINGERPRINT],
  description:
    'Recursive web content discovery (epi052/feroxbuster). Bundled top-1000 wordlist; ' +
    'auto-recurses on directories. Default in `web-crawl-deep`.',
  inputSchema: FeroxbusterInput,
  docker: {
    image: 'autoscanner/feroxbuster:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 1024,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 1_200_000,
  },
  build(input, target) {
    const cmd = [
      'feroxbuster',
      '-u',
      target,
      '-w',
      input.wordlist,
      '-d',
      String(input.depth),
      '--json',
      '--silent',
      '--no-state',
    ];
    if (input.extensions.length > 0) {
      cmd.push('-x', input.extensions.join(','));
    }
    if (input.filterStatus.length > 0) {
      cmd.push('-C', input.filterStatus.join(','));
    }
    return { cmd };
  },
  outputs: [{ format: 'JSONL', capture: 'stdout', parser: 'feroxbuster-json' }],
  produces: ['Endpoint'],
};
