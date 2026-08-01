import type { ZodType } from 'zod';
import type { ClaudeAgentService } from '@autoscanner/claude-agent';

export interface AgentResult<Output> {
  output: Output;
  /** True when Claude was empty/quota-limited or returned invalid output and the fallback ran. */
  degraded: boolean;
}

/**
 * A role-specialised AI agent (SP4). Each concrete agent supplies its persona system prompt, a
 * user prompt for one input, a Zod schema for the expected structured output, and a deterministic
 * `fallback` used whenever Claude is empty/quota-limited or returns output that doesn't validate.
 *
 * `run` NEVER throws — the fleet degrades to the fallback rather than crashing, carrying over the
 * degraded-methodology guarantee the monolithic AutoHunt decider already provided.
 */
export abstract class SecurityAgent<Input, Output> {
  abstract readonly role: string;
  protected abstract readonly outputSchema: ZodType<Output>;
  protected abstract buildSystemPrompt(): string;
  protected abstract buildUserPrompt(input: Input): string;
  protected abstract fallback(input: Input): Output;

  constructor(protected readonly claude: ClaudeAgentService) {}

  async run(input: Input): Promise<AgentResult<Output>> {
    let text: string;
    try {
      const res = await this.claude.complete({
        system: this.buildSystemPrompt(),
        prompt: this.buildUserPrompt(input),
      });
      text = res.text ?? '';
    } catch {
      return { output: this.fallback(input), degraded: true };
    }

    if (!text.trim()) return { output: this.fallback(input), degraded: true };

    let parsed: unknown;
    try {
      // Reuse ClaudeResponse's fence-tolerant parse via a throwaway instance-free path: the
      // agent already has the text, so parse it here to keep this lib free of the response class.
      parsed = parseJsonLoose(text);
    } catch {
      return { output: this.fallback(input), degraded: true };
    }

    const check = this.outputSchema.safeParse(parsed);
    if (!check.success) return { output: this.fallback(input), degraded: true };
    return { output: check.data, degraded: false };
  }
}

/** Fence-tolerant JSON extraction (mirrors ClaudeResponse.json). */
export function parseJsonLoose(text: string): unknown {
  let t = text.trim();
  if (t.startsWith('```')) {
    t = t
      .replace(/^```[a-zA-Z]*\n?/, '')
      .replace(/```$/, '')
      .trim();
  }
  try {
    return JSON.parse(t);
  } catch {
    const s = t.indexOf('{');
    const e = t.lastIndexOf('}');
    if (s >= 0 && e > s) return JSON.parse(t.slice(s, e + 1));
    throw new Error('no JSON object in agent response');
  }
}
