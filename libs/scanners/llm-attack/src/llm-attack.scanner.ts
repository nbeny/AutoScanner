import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

// Canary is planted then checked for leakage; constrain to safe chars (unescaped in argv build).
const SAFE_TOKEN_RE = /^[A-Za-z0-9_.-]+$/;

const LlmAttackInput = z.object({
  endpoint: z.string().url().optional(),
  model: z.string().regex(SAFE_TOKEN_RE).default('gpt-3.5-turbo'),
  canary: z.string().regex(SAFE_TOKEN_RE).default('CANARY-7Q2X9'),
});
export type LlmAttackInputType = z.infer<typeof LlmAttackInput>;

function shEscape(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export const LlmAttackScanner: ScannerDefinition<LlmAttackInputType> = {
  name: 'llm-attack',
  displayName: 'LLM attack',
  category: [ScannerCategory.AI_LLM, ScannerCategory.VULN_SCAN],
  description:
    'Black-box prompt-injection / jailbreak / system-prompt-leak probe against an OpenAI-' +
    'compatible chat endpoint. Sends a curated payload set and flags leaked canaries, jailbreak ' +
    'compliance, and injected-instruction echoes. Key-free (uses the target LLM).',
  inputSchema: LlmAttackInput,
  docker: {
    image: 'autoscanner/llm-attack:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 256,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(input, target) {
    const endpoint = shEscape(input.endpoint ?? `${target.replace(/\/$/, '')}/v1/chat/completions`);
    const model = shEscape(input.model);
    const canary = shEscape(input.canary);
    return {
      cmd: ['sh', '-lc', `llm-attack-probe ${endpoint} ${model} ${canary} > /out/result.json`],
    };
  },
  outputs: [{ format: 'JSON', capture: { path: '/out/result.json' }, parser: 'llm-attack-json' }],
  produces: ['Finding'],
};
