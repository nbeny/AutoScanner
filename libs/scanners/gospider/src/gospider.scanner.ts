import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const GospiderInput = z.object({
  depth: z.number().int().min(1).max(10).default(3),
  concurrency: z.number().int().min(1).max(50).default(10),
  includeSubs: z.boolean().default(false),
  includeOtherSources: z.boolean().default(false),
});
export type GospiderInputType = z.infer<typeof GospiderInput>;

export const GospiderScanner: ScannerDefinition<GospiderInputType> = {
  name: 'gospider',
  displayName: 'gospider',
  category: [ScannerCategory.WEB_ENUM, ScannerCategory.WEB_FINGERPRINT],
  description:
    'Robust web crawler (jaeles-project/gospider) — sitemap, robots, JS-aware. ' +
    'Optional wayback/otx/commoncrawl sourcing via --other-source.',
  inputSchema: GospiderInput,
  docker: {
    image: 'autoscanner/gospider:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 1024,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 1_200_000,
  },
  build(input, target) {
    const cmd = [
      'gospider',
      '-s',
      target,
      '-d',
      String(input.depth),
      '-c',
      String(input.concurrency),
      '-t',
      '5',
      '--json',
      '--no-redirect',
    ];
    if (input.includeOtherSources) cmd.push('-a');
    if (input.includeSubs) cmd.push('--subs');
    return { cmd };
  },
  outputs: [{ format: 'JSONL', capture: 'stdout', parser: 'gospider-json' }],
  produces: ['Endpoint', 'Asset'],
};
