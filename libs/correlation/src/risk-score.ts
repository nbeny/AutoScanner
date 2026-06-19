import type { FindingStatus, PortState, Severity } from '@prisma/client';

// ── CorrelatedFinding cluster descriptor ────────────────────────────────────
// Each entry represents ONE logical vulnerability cluster (a CorrelatedFinding
// row), not a raw finding.  count-once semantics: the caller passes clusters,
// never raw findings.
export interface CorrelatedFindingInput {
  severity: Severity;
  cveId: string | null;
  status: FindingStatus;
  /** CVSS v3 score from the CveCache, or null when not yet fetched / no CVE. */
  cvss: number | null;
}

export interface RiskScoreInput {
  correlatedFindings: ReadonlyArray<CorrelatedFindingInput>;
  ports: ReadonlyArray<{
    number: number;
    state: PortState;
    services: ReadonlyArray<{ name: string | null; product: string | null }>;
  }>;
}

export const SENSITIVE_PORTS: ReadonlySet<number> = new Set([
  22, 23, 445, 1433, 3306, 3389, 5432, 5900, 6379,
]);

export const ADMIN_TOKENS: ReadonlyArray<string> = [
  'admin',
  'phpmyadmin',
  'jenkins',
  'kibana',
  'grafana',
  'prometheus',
];

// ── Severity weight buckets (fallback when CVSS is unavailable) ─────────────
// Used both as the fallback for clusters without a CVE or unresolved CVSS and
// to keep the overall scoring scale consistent (0–10).
export const SEVERITY_WEIGHT: Record<Severity, number> = {
  CRITICAL: 10,
  HIGH: 5,
  MEDIUM: 2,
  LOW: 0.5,
  INFO: 0,
};

// ── CVSS→weight mapping ──────────────────────────────────────────────────────
// CVSS v3 scores are already on a 0–10 scale that maps naturally alongside the
// SEVERITY_WEIGHT buckets (CRITICAL=10, HIGH=5, MEDIUM=2, LOW=0.5).  We use
// the raw CVSS value directly:
//   - CVSS 9.8 (Log4Shell) contributes 9.8 — just under CRITICAL bucket (10),
//     and greatly above MEDIUM (2).
//   - CVSS 10.0 equals the CRITICAL bucket.
//   - CVSS 4.3 (MEDIUM-ish) still outranks LOW (0.5) but not HIGH (5).
// This is the simplest coherent choice: no additional mapping table required.
// If multiple CVSS versions are cached we use cvssV3Score (the primary score
// returned by the CVE enricher); the caller resolves and passes a single Float.
export function clusterWeight(c: CorrelatedFindingInput): number {
  // `??` (not `!== null`) so a missing/undefined cvss also falls back to the
  // severity weight rather than yielding NaN.
  return c.cvss ?? SEVERITY_WEIGHT[c.severity];
}

// Statuses that indicate the finding is no longer actionable — exclude from
// risk score so remediated/false-positive issues don't inflate the score.
const EXCLUDED_STATUSES = new Set<FindingStatus>(['FALSE_POSITIVE', 'RESOLVED']);

function clustersWeight(correlatedFindings: RiskScoreInput['correlatedFindings']): number {
  let total = 0;
  for (const c of correlatedFindings) {
    if (!EXCLUDED_STATUSES.has(c.status)) {
      total += clusterWeight(c);
    }
  }
  return total;
}

function sensitivePortBonus(ports: RiskScoreInput['ports']): number {
  const matched = new Set<number>();
  for (const p of ports) {
    if (p.state === 'OPEN' && SENSITIVE_PORTS.has(p.number)) matched.add(p.number);
  }
  return matched.size * 2;
}

function exposedAdminBonus(ports: RiskScoreInput['ports']): number {
  for (const p of ports) {
    for (const s of p.services) {
      const hay = `${(s.name ?? '').toLowerCase()} ${(s.product ?? '').toLowerCase()}`;
      for (const tok of ADMIN_TOKENS) {
        if (hay.includes(tok)) return 3;
      }
    }
  }
  return 0;
}

export function computeRiskScore(input: RiskScoreInput): number {
  return (
    clustersWeight(input.correlatedFindings) +
    sensitivePortBonus(input.ports) +
    exposedAdminBonus(input.ports)
  );
}
