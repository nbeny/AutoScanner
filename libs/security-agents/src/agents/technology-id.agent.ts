import { Injectable } from '@nestjs/common';

import { SecurityAgent } from '../security-agent';
import { TechIdOutputSchema, type TechIdInput, type TechIdOutput } from '../planning-schemas';

/** Part 3 §3 — infer the technology stack behind a service from its fingerprints. */
@Injectable()
export class TechnologyIdAgent extends SecurityAgent<TechIdInput, TechIdOutput> {
  readonly role = 'technology-id';
  protected readonly outputSchema = TechIdOutputSchema;

  protected buildSystemPrompt(): string {
    return [
      'You are a web technology fingerprinting expert.',
      'From the HTTP headers, open ports and detected services, infer the technology stack',
      '(server, framework, CMS, language, notable middleware).',
      'Reply ONLY with a JSON object:',
      '{"technologies": [{"name": string, "version"?: string, "confidence"?: number 0-100}]}',
      'Only list technologies the evidence supports. No prose outside the JSON.',
    ].join('\n');
  }

  protected buildUserPrompt(input: TechIdInput): string {
    return JSON.stringify(
      {
        host: input.host,
        headers: input.headers ?? {},
        ports: input.ports ?? [],
        services: input.services ?? [],
      },
      null,
      2,
    );
  }

  protected fallback(input: TechIdInput): TechIdOutput {
    // No AI available — surface the raw service names as low-confidence technologies so the
    // Planner still has something to key playbooks on.
    return {
      technologies: (input.services ?? []).map((name) => ({ name, confidence: 30 })),
    };
  }
}
