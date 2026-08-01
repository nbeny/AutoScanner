import { z } from 'zod';

export const PRIORITY = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type Priority = (typeof PRIORITY)[number];

// ── Finding Analyst ─────────────────────────────────────────────────────────
export interface AnalystInput {
  title: string;
  severity: string;
  cveId?: string | null;
  location?: string | null;
  evidence?: unknown;
}
export const AnalystOutputSchema = z.object({
  summary: z.string(),
  impact: z.string(),
  priority: z.enum(PRIORITY),
  action: z.string(),
});
export type AnalystOutput = z.infer<typeof AnalystOutputSchema>;

// ── False-Positive Analysis ─────────────────────────────────────────────────
export const FP_STATUS = ['confirmed', 'suspected', 'false_positive'] as const;
export interface FpInput {
  title: string;
  severity: string;
  evidence?: unknown;
  assetContext?: string | null;
}
export const FpOutputSchema = z.object({
  confidence: z.number().min(0).max(100),
  status: z.enum(FP_STATUS),
  reason: z.string().optional(),
});
export type FpOutput = z.infer<typeof FpOutputSchema>;

// ── Remediation ─────────────────────────────────────────────────────────────
export const AUDIENCE = ['developer', 'sysadmin', 'cloud', 'devops'] as const;
export interface RemediationInput {
  title: string;
  severity: string;
  cveId?: string | null;
  technology?: string | null;
}
export const RemediationOutputSchema = z.object({
  summary: z.string(),
  steps: z.array(z.string()).min(1),
  audience: z.enum(AUDIENCE),
});
export type RemediationOutput = z.infer<typeof RemediationOutputSchema>;

/** Map a scanner severity string onto the analyst priority bucket (fallback helper). */
export function severityToPriority(severity: string): Priority {
  const s = severity.toUpperCase();
  if (s === 'CRITICAL') return 'CRITICAL';
  if (s === 'HIGH') return 'HIGH';
  if (s === 'MEDIUM') return 'MEDIUM';
  return 'LOW';
}
