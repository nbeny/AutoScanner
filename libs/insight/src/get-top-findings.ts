import type { PrismaClient, Severity } from '@prisma/client';

export interface TopFinding {
  dedupHash: string;
  title: string;
  severity: Severity;
  cveId: string | null;
  affectedAssetCount: number;
  scannerSources: string[];
  firstSeenAt: Date;
  lastSeenAt: Date;
  exampleAssetId: string;
}

const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 5,
  HIGH: 4,
  MEDIUM: 3,
  LOW: 2,
  INFO: 1,
};

export async function getTopFindings(
  prisma: PrismaClient,
  engagementId: string,
  limit: number,
): Promise<TopFinding[]> {
  const rows = await prisma.finding.findMany({
    where: { asset: { engagementId, deletedAt: null } },
    select: {
      assetId: true,
      dedupHash: true,
      title: true,
      severity: true,
      cveId: true,
      firstSeenAt: true,
      lastSeenAt: true,
      scanJob: { select: { scannerName: true } },
    },
  });

  type Group = {
    dedupHash: string;
    title: string;
    severity: Severity;
    cveId: string | null;
    assetIds: Set<string>;
    scanners: Set<string>;
    firstSeenAt: Date;
    lastSeenAt: Date;
    exampleAssetId: string;
  };

  const groups = new Map<string, Group>();
  for (const r of rows) {
    let g = groups.get(r.dedupHash);
    if (!g) {
      g = {
        dedupHash: r.dedupHash,
        title: r.title,
        severity: r.severity,
        cveId: r.cveId,
        assetIds: new Set(),
        scanners: new Set(),
        firstSeenAt: r.firstSeenAt,
        lastSeenAt: r.lastSeenAt,
        exampleAssetId: r.assetId,
      };
      groups.set(r.dedupHash, g);
    }
    g.assetIds.add(r.assetId);
    g.scanners.add(r.scanJob.scannerName);
    if (r.firstSeenAt < g.firstSeenAt) g.firstSeenAt = r.firstSeenAt;
    if (r.lastSeenAt > g.lastSeenAt) g.lastSeenAt = r.lastSeenAt;
  }

  const arr: TopFinding[] = [];
  for (const g of groups.values()) {
    arr.push({
      dedupHash: g.dedupHash,
      title: g.title,
      severity: g.severity,
      cveId: g.cveId,
      affectedAssetCount: g.assetIds.size,
      scannerSources: Array.from(g.scanners).sort(),
      firstSeenAt: g.firstSeenAt,
      lastSeenAt: g.lastSeenAt,
      exampleAssetId: g.exampleAssetId,
    });
  }

  arr.sort((a, b) => {
    const sevDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (sevDiff !== 0) return sevDiff;
    return b.affectedAssetCount - a.affectedAssetCount;
  });

  return arr.slice(0, limit);
}
