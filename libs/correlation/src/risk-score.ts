import type { PortState, Severity } from '@prisma/client';

/** Inputs the risk-score formula consumes. Decoupled from Prisma row shapes
 *  so callers (parser-worker + backfill script) can pass any equivalent
 *  projection. */
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

export function computeRiskScore(_input: RiskScoreInput): number {
  // Implemented in Task 2.
  return 0;
}
