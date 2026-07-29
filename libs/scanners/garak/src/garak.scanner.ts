import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const SAFE_TOKEN_RE = /^[A-Za-z0-9_.-]+$/;
const DEFAULT_PROBES = ['promptinject', 'dan', 'leakreplay'];

const GarakInput = z.object({
  endpoint: z.string().url().optional(),
  model: z.string().regex(SAFE_TOKEN_RE).default('gpt-3.5-turbo'),
  probes: z.array(z.string().regex(SAFE_TOKEN_RE).min(1)).default(DEFAULT_PROBES),
});
export type GarakInputType = z.infer<typeof GarakInput>;

function shEscape(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export const GarakScanner: ScannerDefinition<GarakInputType> = {
  name: 'garak',
  displayName: 'garak',
  category: [ScannerCategory.AI_LLM, ScannerCategory.VULN_SCAN],
  description:
    'LLM red-team (NVIDIA garak) against an OpenAI-compatible endpoint: prompt-injection, ' +
    'jailbreak (DAN), and data-leak probes. Experimental/best-effort — requires a reachable LLM.',
  inputSchema: GarakInput,
  docker: {
    image: 'autoscanner/garak:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: false, // garak writes reports + caches under $HOME
    memoryLimitMb: 2048,
    cpuQuota: 2_000_000,
    defaultTimeoutMs: 1_800_000,
  },
  build(input, target) {
    const endpoint = shEscape(input.endpoint ?? target);
    const model = shEscape(input.model);
    const probes = shEscape(input.probes.join(','));
    // garak's openai generator reads OPENAI_API_BASE + OPENAI_API_KEY from env; we point the
    // base at the target and use a dummy key (key-free endpoints ignore it). With
    // --report_prefix /out/garak, garak writes exactly /out/garak.report.jsonl (the capture path).
    const run =
      `export OPENAI_API_BASE=${endpoint}; export OPENAI_API_KEY=sk-none; ` +
      `garak --model_type openai --model_name ${model} --probes ${probes} ` +
      `--report_prefix /out/garak >/dev/null 2>&1 || true`;
    return { cmd: ['sh', '-lc', run] };
  },
  outputs: [
    { format: 'JSONL', capture: { path: '/out/garak.report.jsonl' }, parser: 'garak-jsonl' },
  ],
  produces: ['Finding'],
};
