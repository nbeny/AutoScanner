import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { SecurityAgent } from '../security-agent';

export interface CopilotInput {
  question: string;
  /** Compact engagement context: risk summary, top findings, exposed assets. */
  context: string;
}

export const CopilotOutputSchema = z.object({
  answer: z.string(),
  references: z.array(z.string()).default([]),
});
export type CopilotOutput = z.infer<typeof CopilotOutputSchema>;

/**
 * Part 3 §15 / Part 4 §17 — the Security Copilot. Answers an operator's question ("what are my
 * critical risks?", "what should I fix first?", "which assets are exposed?") grounded in the
 * engagement context the caller assembles from the database. Infra-free: no Vector DB / RAG yet —
 * the context is passed inline (SP6 attack-graph + RAG enrichment is a later slice).
 */
@Injectable()
export class SecurityCopilotAgent extends SecurityAgent<CopilotInput, CopilotOutput> {
  readonly role = 'copilot';
  protected readonly outputSchema = CopilotOutputSchema;

  protected buildSystemPrompt(): string {
    return [
      'You are the AutoScanner Security Copilot.',
      'Answer the operator strictly from the engagement CONTEXT provided — do not invent findings,',
      'assets or CVEs that are not present. Be concise and actionable; when prioritising, lead with',
      'the highest-risk items. If the context does not contain the answer, say so plainly.',
      'Reply ONLY with a JSON object:',
      '{"answer": string, "references": string[]}  (references = finding titles / asset values you cited)',
      'No prose outside the JSON.',
    ].join('\n');
  }

  protected buildUserPrompt(input: CopilotInput): string {
    return `CONTEXT:\n${input.context}\n\nQUESTION:\n${input.question}`;
  }

  protected fallback(_input: CopilotInput): CopilotOutput {
    return {
      answer:
        'The AI copilot is unavailable right now. Review the engagement dashboard for the ' +
        'current critical findings and exposed assets.',
      references: [],
    };
  }
}
