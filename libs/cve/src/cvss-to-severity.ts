import type { Severity } from '@prisma/client';

export function cvssToSeverity(score: number | null | undefined): Severity | null {
  if (score === null || score === undefined) return null;
  if (Number.isNaN(score)) return null;
  if (score >= 9) return 'CRITICAL';
  if (score >= 7) return 'HIGH';
  if (score >= 4) return 'MEDIUM';
  return 'LOW';
}
