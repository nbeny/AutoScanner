import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const JsluiceInput = z.object({
  extractUrls: z.boolean().default(true),
  extractSecrets: z.boolean().default(true),
});
export type JsluiceInputType = z.infer<typeof JsluiceInput>;

function shEscape(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export const JsluiceScanner: ScannerDefinition<JsluiceInputType> = {
  name: 'jsluice',
  displayName: 'jsluice',
  category: [ScannerCategory.WEB_ENUM, ScannerCategory.API_SECURITY],
  description:
    'AST-based JS extraction (Mandiant/jsluice). Two passes: URL extraction and secret extraction. ' +
    'Precise alternative to regex-only linkfinder.',
  inputSchema: JsluiceInput,
  docker: {
    image: 'autoscanner/jsluice:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(input, target) {
    const url = shEscape(target);
    const passes: string[] = [];
    if (input.extractUrls) {
      passes.push(`printf '%s\\n' ${url} | jsluice urls`);
    }
    if (input.extractSecrets) {
      passes.push(`printf '%s\\n' ${url} | jsluice secrets`);
    }
    const script = passes.length > 0 ? passes.join(' ; ') : 'true';
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'JSONL', capture: 'stdout', parser: 'jsluice-jsonl' }],
  produces: ['Endpoint', 'Finding'],
};
