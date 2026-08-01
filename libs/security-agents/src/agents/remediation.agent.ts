import { Injectable } from '@nestjs/common';
import type { ZodType } from 'zod';

import { SecurityAgent } from '../security-agent';
import { RemediationOutputSchema, type RemediationInput, type RemediationOutput } from '../schemas';

/** Part 3 §11 — propose concrete, audience-specific fixes (code/config level, not just "patch"). */
@Injectable()
export class RemediationAgent extends SecurityAgent<RemediationInput, RemediationOutput> {
  readonly role = 'remediation';
  protected readonly outputSchema: ZodType<RemediationOutput> = RemediationOutputSchema;

  protected buildSystemPrompt(): string {
    return [
      'You are a remediation engineer.',
      'Propose CONCRETE fixes for the finding — code-level or config-level, not just "patch the',
      'system". Prefer specific, verifiable steps (e.g. parameterised queries, DTO validation,',
      'rate limiting, a WAF rule, a version to upgrade to). Pick the audience best suited to apply',
      'them. Reply ONLY with a JSON object:',
      '{"summary": string, "steps": string[], "audience": "developer"|"sysadmin"|"cloud"|"devops"}',
      'No prose outside the JSON.',
    ].join('\n');
  }

  protected buildUserPrompt(input: RemediationInput): string {
    return JSON.stringify(
      {
        title: input.title,
        severity: input.severity,
        cveId: input.cveId ?? null,
        technology: input.technology ?? null,
      },
      null,
      2,
    );
  }

  protected fallback(input: RemediationInput): RemediationOutput {
    return {
      summary: `Mitigate: ${input.title}`,
      steps: [
        'Confirm the affected component and version.',
        input.cveId
          ? `Apply the fix for ${input.cveId} (upgrade to a patched release).`
          : 'Apply the vendor-recommended patch or configuration hardening.',
        'Restrict network exposure of the affected service until fixed.',
        'Re-scan to verify the issue is resolved.',
      ],
      audience: 'sysadmin',
    };
  }
}
