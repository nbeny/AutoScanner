import { Injectable } from '@nestjs/common';
import type { ZodType } from 'zod';

import { SecurityAgent } from '../security-agent';
import {
  AnalystOutputSchema,
  severityToPriority,
  type AnalystInput,
  type AnalystOutput,
} from '../schemas';

/** Part 3 §6 — turns one technical finding into plain-language impact / priority / action. */
@Injectable()
export class FindingAnalystAgent extends SecurityAgent<AnalystInput, AnalystOutput> {
  readonly role = 'finding-analyst';
  protected readonly outputSchema: ZodType<AnalystOutput> = AnalystOutputSchema;

  protected buildSystemPrompt(): string {
    return [
      'You are a senior security analyst.',
      'Given ONE technical finding, explain its real-world impact, assign a priority, and state',
      'the single most important remediation action, in plain language a busy operator can act on.',
      'Reply ONLY with a JSON object:',
      '{"summary": string, "impact": string, "priority": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL", "action": string}',
      'No prose outside the JSON.',
    ].join('\n');
  }

  protected buildUserPrompt(input: AnalystInput): string {
    return JSON.stringify(
      {
        title: input.title,
        severity: input.severity,
        cveId: input.cveId ?? null,
        location: input.location ?? null,
        evidence: input.evidence ?? null,
      },
      null,
      2,
    );
  }

  protected fallback(input: AnalystInput): AnalystOutput {
    const priority = severityToPriority(input.severity);
    return {
      summary: input.title,
      impact: `A ${input.severity} issue was reported${input.cveId ? ` (${input.cveId})` : ''}.`,
      priority,
      action: 'Review the finding and apply the vendor-recommended fix or mitigation.',
    };
  }
}
