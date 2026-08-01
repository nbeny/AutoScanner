import type { Prisma, PrismaClient } from '@prisma/client';
import { computeRiskScore } from './risk-score';
import { resolveCvssScores } from './resolve-cvss';

export type PrismaLike = PrismaClient | Prisma.TransactionClient;

/**
 * Compute (do NOT write) an asset's v2 risk score using the formula in `risk-score.ts`.
 *
 * v2 semantics:
 * - Reads CorrelatedFinding clusters instead of raw findings (count-once).
 * - Resolves each distinct cveId's CVSS v3 score via `resolveCvssScores` (NvdCve → CveCache,
 *   one source of truth — SP2b defect 3). Clusters without a CVE or an unresolved CVSS fall
 *   back to the SEVERITY_WEIGHT bucket.
 * - `computeRiskScore` excludes clusters with status FALSE_POSITIVE or RESOLVED.
 *
 * Contract: read-only. It returns the score; the ONLY writer of `Asset.riskScore` is
 * risk-engine (SP2b), which calls this then persists. Throws if the asset id is unknown.
 */
export async function computeAssetRiskScore(prisma: PrismaLike, assetId: string): Promise<number> {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: {
      id: true,
      correlatedFindings: { select: { severity: true, cveId: true, status: true } },
      ports: {
        select: {
          number: true,
          state: true,
          services: { select: { name: true, product: true } },
        },
      },
    },
  });
  if (!asset) throw new Error(`Asset not found: ${assetId}`);

  const cveIds = asset.correlatedFindings
    .filter((cf) => cf.cveId !== null)
    .map((cf) => cf.cveId as string);
  const cvssMap = await resolveCvssScores(prisma, cveIds);

  const correlatedFindings = asset.correlatedFindings.map((cf) => ({
    severity: cf.severity,
    cveId: cf.cveId,
    status: cf.status,
    cvss: cf.cveId !== null ? (cvssMap.get(cf.cveId) ?? null) : null,
  }));

  return computeRiskScore({ correlatedFindings, ports: asset.ports });
}
