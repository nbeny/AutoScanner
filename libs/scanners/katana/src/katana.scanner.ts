import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory, authHeaderLines } from '@autoscanner/scanner-sdk';

const KatanaInput = z.object({
  depth: z.number().int().min(1).max(10).default(3),
});

export type KatanaInputType = z.infer<typeof KatanaInput>;

export const KatanaScanner: ScannerDefinition<KatanaInputType> = {
  name: 'katana',
  displayName: 'Katana',
  category: [ScannerCategory.WEB_ENUM, ScannerCategory.WEB_FINGERPRINT],
  description: 'Web crawler / endpoint discovery (ProjectDiscovery katana).',
  inputSchema: KatanaInput,
  docker: {
    image: 'projectdiscovery/katana:v1.6.1',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 1024,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(input, target, ctx) {
    const cmd = ['katana', '-u', target, '-jsonl', '-silent', '-d', String(input.depth)];
    // Authenticated crawl: attach session headers so katana reaches pages
    // behind login. No-op (identical cmd) when no auth is configured.
    for (const header of authHeaderLines(ctx.auth)) cmd.push('-H', header);
    return { cmd };
  },
  outputs: [{ format: 'JSONL', capture: 'stdout', parser: 'katana-json' }],
  produces: ['Endpoint'],
};
