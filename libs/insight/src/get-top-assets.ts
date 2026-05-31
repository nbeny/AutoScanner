import type { AssetType, PrismaClient } from '@prisma/client';

export interface TopAsset {
  id: string;
  kind: AssetType;
  canonicalValue: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  findingsCount: number;
  criticalCount: number;
  highCount: number;
}

/**
 * Phase 3.1 placeholder: assets are sorted by total findings count desc.
 * Phase 3.2 will swap this for Asset.riskScore desc once the score is
 * actually computed by parser-worker.
 */
export async function getTopAssets(
  prisma: PrismaClient,
  engagementId: string,
  limit: number,
): Promise<TopAsset[]> {
  const assets = await prisma.asset.findMany({
    where: { engagementId, deletedAt: null },
    select: {
      id: true,
      type: true,
      canonicalValue: true,
      firstSeenAt: true,
      lastSeenAt: true,
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
      findingsCount: a.findings.length,
      criticalCount: critical,
      highCount: high,
    };
  });

  enriched.sort((x, y) => {
    if (y.findingsCount !== x.findingsCount) return y.findingsCount - x.findingsCount;
    return x.canonicalValue.localeCompare(y.canonicalValue);
  });

  return enriched.slice(0, limit);
}
