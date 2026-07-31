import type { TemplateDefinition } from '../types';

/**
 * Phase (breach/auth/AI modern scanners) — AI/LLM surface recon + attack.
 *
 * Chain: llm-recon (fingerprint exposed/unauthenticated LLM inference
 * endpoints — Ollama, LM Studio, OpenAI-compatible APIs, LangServe, Triton)
 * → llm-attack (black-box prompt-injection / jailbreak / system-prompt-leak
 * probe against the OpenAI-compatible chat endpoint discovered/assumed on
 * the target).
 *
 * llm-attack sends live payloads to the target's LLM chat endpoint — this is
 * an active-injection step against the engagement target, hence the
 * scope-acknowledgement banner.
 *
 * jwt-tool and garak are intentionally NOT included: jwt-tool no-ops
 * without an operator-supplied token, and garak is a best-effort/heavy scan
 * that needs a live LLM endpoint already confirmed — both remain manual-run
 * only.
 */
export const AiLlmSurface: TemplateDefinition = {
  name: 'ai-llm-surface',
  displayName: 'AI / LLM Surface',
  description:
    'AI/LLM attack surface recon: llm-recon fingerprints exposed/unauthenticated LLM inference ' +
    'endpoints (Ollama, LM Studio, OpenAI-compatible APIs, LangServe, Triton) → llm-attack probes ' +
    'the discovered endpoint for prompt-injection, jailbreak compliance, and system-prompt leakage.',
  scopeAcknowledgement:
    "llm-attack sends live prompt-injection / jailbreak payloads to the target's LLM chat " +
    "endpoint. Verify the engagement scope explicitly allows automated probing of the target's " +
    'AI/LLM services before launching.',
  steps: [
    { scannerName: 'llm-recon', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'llm-attack', inputs: {}, target: { kind: 'context', path: 'target' } },
  ],
};
