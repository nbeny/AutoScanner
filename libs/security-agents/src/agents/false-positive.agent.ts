import { Injectable } from '@nestjs/common';
import type { ZodType } from 'zod';

import { SecurityAgent } from '../security-agent';
import { FpOutputSchema, type FpInput, type FpOutput } from '../schemas';

/** Part 3 §7 — assess whether a finding is a true positive, with a confidence score. */
@Injectable()
export class FalsePositiveAgent extends SecurityAgent<FpInput, FpOutput> {
  readonly role = 'false-positive';
  protected readonly outputSchema: ZodType<FpOutput> = FpOutputSchema;

  protected buildSystemPrompt(): string {
    return [
      'You are a security triage analyst reducing false-positive noise.',
      'Given a finding, its evidence and the asset context, judge whether it is a true positive.',
      'Reply ONLY with a JSON object:',
      '{"confidence": number 0-100, "status": "confirmed"|"suspected"|"false_positive", "reason": string}',
      'Higher confidence means more certain it is a real, exploitable issue. No prose outside JSON.',
    ].join('\n');
  }

  protected buildUserPrompt(input: FpInput): string {
    return JSON.stringify(
      {
        title: input.title,
        severity: input.severity,
        evidence: input.evidence ?? null,
        assetContext: input.assetContext ?? null,
      },
      null,
      2,
    );
  }

  protected fallback(input: FpInput): FpOutput {
    // No AI judgement available — stay neutral: mid confidence, mark suspected (never auto-confirm
    // and never auto-dismiss, so an operator still reviews it).
    const s = input.severity.toUpperCase();
    const confidence = s === 'CRITICAL' || s === 'HIGH' ? 60 : 45;
    return { confidence, status: 'suspected', reason: 'No AI triage available; needs review.' };
  }
}
