import type { PortState, Severity } from '@prisma/client';

export interface RiskScoreInput {
  findings: ReadonlyArray<{ severity: Severity; cveId: string | null }>;
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

const SEVERITY_WEIGHT: Record<Severity, number> = {
  CRITICAL: 10,
  HIGH: 5,
  MEDIUM: 2,
  LOW: 0.5,
  INFO: 0,
};

function findingsWeight(findings: RiskScoreInput['findings']): number {
  let total = 0;
  for (const f of findings) total += SEVERITY_WEIGHT[f.severity];
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

function cveBonus(findings: RiskScoreInput['findings']): number {
  const seen = new Set<string>();
  for (const f of findings) if (f.cveId) seen.add(f.cveId);
  return seen.size;
}

export function computeRiskScore(input: RiskScoreInput): number {
  return (
    findingsWeight(input.findings) +
    sensitivePortBonus(input.ports) +
    exposedAdminBonus(input.ports) +
    cveBonus(input.findings)
  );
}
