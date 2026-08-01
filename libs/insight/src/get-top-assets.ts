import type { AssetType, PrismaClient } from '@prisma/client';

export interface TopAsset {
  id: string;
  kind: AssetType;
  canonicalValue: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  riskScore: number;
  findingsCount: number;
  criticalCount: number;
  highCount: number;
}

/**
 * Ranks an engagement's assets by `Asset.riskScore`, which asset-service now maintains
 * (it was not computed when this was written, hence the old findings-count placeholder).
 *
 * Ordering and limiting happen in SQL: the previous version loaded every asset in the
 * engagement together with every one of its findings, ranked in JS and then sliced — so a
 * large engagement paid for the whole graph to return a handful of rows.
 */
export async function getTopAssets(
  prisma: PrismaClient,
  engagementId: string,
  limit: number,
): Promise<TopAsset[]> {
  const assets = await prisma.asset.findMany({
    where: { engagementId, deletedAt: null },
    orderBy: [{ riskScore: 'desc' }, { canonicalValue: 'asc' }],
    take: limit,
    select: {
      id: true,
      type: true,
      canonicalValue: true,
      firstSeenAt: true,
      lastSeenAt: true,
      riskScore: true,
      findings: { select: { severity: true } },
    },
  });

  const enriched: TopAsset[] = assets.map((a) => {
    let critical = 0;
    let high = 0;
    for (const f of a.findings) {
      if (f.severity === 'CRITICAL') critical++;
      else if (f.severity === 'HIGH') high++;
    }
    return {
      id: a.id,
      kind: a.type,
      canonicalValue: a.canonicalValue,
      firstSeenAt: a.firstSeenAt,
      lastSeenAt: a.lastSeenAt,
      riskScore: a.riskScore,
      findingsCount: a.findings.length,
      criticalCount: critical,
      highCount: high,
    };
  });

  // Already ordered and limited by the query.
  return enriched;
}
