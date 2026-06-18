import type { EngagementStatus, PrismaClient, Severity } from '@prisma/client';
import type { SeverityCounts } from './get-engagement-overview';

export interface EngagementSummary {
  id: string;
  name: string;
  clientName: string;
  status: EngagementStatus;
  createdAt: Date;
  assetCount: number;
  findingsBySeverity: SeverityCounts;
  lastActivityAt: Date;
}

function zeroSeverity(): SeverityCounts {
  return { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
}

function addSeverity(counts: SeverityCounts, sev: Severity, n: number): void {
  if (sev === 'CRITICAL') counts.critical += n;
  else if (sev === 'HIGH') counts.high += n;
  else if (sev === 'MEDIUM') counts.medium += n;
  else if (sev === 'LOW') counts.low += n;
  else if (sev === 'INFO') counts.info += n;
}

function maxDate(...dates: (Date | null | undefined)[]): Date | null {
  let max: Date | null = null;
  for (const d of dates) {
    if (d && (!max || d.getTime() > max.getTime())) max = d;
  }
  return max;
}

/**
 * One summary card row per engagement owned by `ownerId`: asset count, severity
 * breakdown and last-activity timestamp, ordered by last activity descending so
 * the busiest engagements surface first. Aggregation is batched (no N+1):
 * engagements are fetched once, then asset/finding/scan/templateRun rollups are
 * stitched in memory.
 */
export async function getEngagementSummaries(
  prisma: PrismaClient,
  ownerId: string,
): Promise<EngagementSummary[]> {
  const engagements = await prisma.engagement.findMany({
    where: { ownerId, deletedAt: null },
    select: { id: true, name: true, clientName: true, status: true, createdAt: true },
  });

  if (engagements.length === 0) return [];

  const ids = engagements.map((e) => e.id);

  const [assetGroups, findings, scanGroups, runGroups] = await Promise.all([
    prisma.asset.groupBy({
      by: ['engagementId'],
      where: { engagementId: { in: ids }, deletedAt: null },
      _count: { _all: true },
    }),
    prisma.finding.findMany({
      where: { asset: { engagementId: { in: ids }, deletedAt: null } },
      select: { severity: true, asset: { select: { engagementId: true } } },
    }),
    prisma.scan.groupBy({
      by: ['engagementId'],
      where: { engagementId: { in: ids } },
      _max: { createdAt: true, completedAt: true },
    }),
    prisma.templateRun.groupBy({
      by: ['engagementId'],
      where: { engagementId: { in: ids } },
      _max: { createdAt: true, completedAt: true },
    }),
  ]);

  const assetCountById = new Map<string, number>();
  for (const g of assetGroups) {
    assetCountById.set(g.engagementId, (g as { _count: { _all: number } })._count._all);
  }

  const severityById = new Map<string, SeverityCounts>();
  for (const f of findings) {
    const engId = f.asset?.engagementId;
    if (!engId) continue;
    let counts = severityById.get(engId);
    if (!counts) {
      counts = zeroSeverity();
      severityById.set(engId, counts);
    }
    addSeverity(counts, f.severity as Severity, 1);
  }

  const activityById = new Map<string, Date | null>();
  for (const g of scanGroups) {
    const m = g as {
      engagementId: string;
      _max: { createdAt: Date | null; completedAt: Date | null };
    };
    activityById.set(m.engagementId, maxDate(m._max.createdAt, m._max.completedAt));
  }
  for (const g of runGroups) {
    const m = g as {
      engagementId: string;
      _max: { createdAt: Date | null; completedAt: Date | null };
    };
    activityById.set(
      m.engagementId,
      maxDate(activityById.get(m.engagementId), m._max.createdAt, m._max.completedAt),
    );
  }

  const summaries = engagements.map((e) => ({
    id: e.id,
    name: e.name,
    clientName: e.clientName,
    status: e.status,
    createdAt: e.createdAt,
    assetCount: assetCountById.get(e.id) ?? 0,
    findingsBySeverity: severityById.get(e.id) ?? zeroSeverity(),
    lastActivityAt: maxDate(activityById.get(e.id), e.createdAt) ?? e.createdAt,
  }));

  summaries.sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
  return summaries;
}
