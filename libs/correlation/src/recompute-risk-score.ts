import type { Prisma, PrismaClient } from '@prisma/client';
import { computeRiskScore } from './risk-score';

export type PrismaLike = PrismaClient | Prisma.TransactionClient;

/**
 * Recompute Asset.riskScore using the v2 formula in `libs/correlation/risk-score.ts`.
 *
 * v2 changes vs v1:
 * - Reads CorrelatedFinding clusters instead of raw findings (count-once semantics).
 * - Resolves CVSS v3 scores from CveCache for each distinct cveId in the clusters
 *   and passes them to computeRiskScore.  Clusters without a CVE or an unresolved
 *   CVSS fall back to the SEVERITY_WEIGHT bucket.
 * - Excludes clusters with status FALSE_POSITIVE or RESOLVED.
 *
 * Caller contract (unchanged from v1):
 * - Read-modify-write. Caller is expected to wrap this in the same transaction as
 *   the persister upsert (see parser-worker for the retry-on-P2034 pattern).
 * - Throws if the asset id is unknown.
 * - Does not soft-delete-check (callers in parser-worker are always operating on
 *   the asset they just upserted; the backfill script filters `deletedAt = null`
 *   before iterating).
 */
export async function recomputeRiskScoreForAsset(
  prisma: PrismaLike,
  assetId: string,
): Promise<number> {
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

  // Collect the distinct non-null cveIds from correlated clusters.
  const cveIds = [
    ...new Set(
      asset.correlatedFindings.filter((cf) => cf.cveId !== null).map((cf) => cf.cveId as string),
    ),
  ];

  // Look up CVSS v3 scores from the cache for each distinct CVE.
  // We use cvssV3Score as the primary score (the CVE enricher stores this field).
  // Any CVE not yet in the cache (or with fetchStatus=ERROR) simply won't appear
  // in the result set — those clusters will fall back to severity-bucket weight.
  const cvssMap = new Map<string, number | null>();
  if (cveIds.length > 0) {
    const cves = await prisma.cveCache.findMany({
      where: { cveId: { in: cveIds } },
      select: { cveId: true, cvssV3Score: true },
    });
    for (const row of cves) {
      cvssMap.set(row.cveId, row.cvssV3Score ?? null);
    }
  }

  // Build the CorrelatedFindingInput array with resolved CVSS scores.
  const correlatedFindings = asset.correlatedFindings.map((cf) => ({
    severity: cf.severity,
    cveId: cf.cveId,
    status: cf.status,
    cvss: cf.cveId !== null ? (cvssMap.get(cf.cveId) ?? null) : null,
  }));

  const score = computeRiskScore({
    correlatedFindings,
    ports: asset.ports,
  });

  await prisma.asset.update({
    where: { id: assetId },
    data: { riskScore: score },
  });

  return score;
}
