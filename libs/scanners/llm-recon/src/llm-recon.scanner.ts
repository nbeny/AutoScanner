import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const LlmReconInput = z.object({
  baseUrl: z.string().url().optional(),
});
export type LlmReconInputType = z.infer<typeof LlmReconInput>;

function shEscape(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export const LlmReconScanner: ScannerDefinition<LlmReconInputType> = {
  name: 'llm-recon',
  displayName: 'LLM recon',
  category: [ScannerCategory.AI_LLM, ScannerCategory.WEB_FINGERPRINT],
  description:
    'Fingerprints exposed / unauthenticated LLM inference endpoints (Ollama, LM Studio, ' +
    'OpenAI-compatible APIs, LangServe, Triton) on a host.',
  inputSchema: LlmReconInput,
  docker: {
    image: 'autoscanner/llm-recon:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 256,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(input, target) {
    const base = shEscape(input.baseUrl ?? target);
    return { cmd: ['sh', '-lc', `llm-recon-probe ${base} > /out/result.json`] };
  },
  outputs: [{ format: 'JSON', capture: { path: '/out/result.json' }, parser: 'llm-recon-json' }],
  produces: ['Finding'],
};
