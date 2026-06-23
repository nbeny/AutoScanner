import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const WebanalyzeInput = z.object({
  crawlDepth: z.number().int().min(0).max(3).default(0),
});
export type WebanalyzeInputType = z.infer<typeof WebanalyzeInput>;

export const WebanalyzeScanner: ScannerDefinition<WebanalyzeInputType> = {
  name: 'webanalyze',
  displayName: 'webanalyze (deep tech fingerprint)',
  category: [ScannerCategory.WEB_FINGERPRINT],
  description:
    'Wappalyzer-based technology fingerprinting (CMS, frameworks, libraries, servers) with a ' +
    'fingerprint database baked into the image. Key-free.',
  inputSchema: WebanalyzeInput,
  docker: {
    image: 'autoscanner/webanalyze:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(input, target, _ctx) {
    const crawl = input.crawlDepth > 0 ? ` -crawl ${input.crawlDepth}` : '';
    const script = `webanalyze -host '${target}' -apps /technologies.json -output json${crawl} || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'JSON', capture: 'stdout', parser: 'webanalyze-json' }],
  produces: ['Technology'],
};
