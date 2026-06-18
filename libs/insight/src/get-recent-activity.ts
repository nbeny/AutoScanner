import type { PrismaClient } from '@prisma/client';

export type ActivityKind = 'TEMPLATE_RUN' | 'SCAN';

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  engagementId: string;
  engagementName: string;
  label: string;
  status: string;
  ts: Date;
}

/**
 * Unified, cross-engagement recent-activity feed for `ownerId`: the most recent
 * template runs and scans across every owned engagement, merged and sorted by
 * their most relevant timestamp (completed ?? started/created) descending.
 */
export async function getRecentActivity(
  prisma: PrismaClient,
  ownerId: string,
  limit: number,
): Promise<ActivityItem[]> {
  const engagements = await prisma.engagement.findMany({
    where: { ownerId, deletedAt: null },
    select: { id: true, name: true },
  });

  if (engagements.length === 0) return [];

  const ids = engagements.map((e) => e.id);
  const nameById = new Map(engagements.map((e) => [e.id, e.name]));

  const [runs, scans] = await Promise.all([
    prisma.templateRun.findMany({
      where: { engagementId: { in: ids } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        templateName: true,
        status: true,
        engagementId: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
      },
    }),
    prisma.scan.findMany({
      where: { engagementId: { in: ids } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        name: true,
        status: true,
        engagementId: true,
        completedAt: true,
        createdAt: true,
      },
    }),
  ]);

  const items: ActivityItem[] = [
    ...runs.map((r) => ({
      id: r.id,
      kind: 'TEMPLATE_RUN' as const,
      engagementId: r.engagementId,
      engagementName: nameById.get(r.engagementId) ?? '',
      label: r.templateName,
      status: r.status as string,
      ts: r.completedAt ?? r.startedAt ?? r.createdAt,
    })),
    ...scans.map((s) => ({
      id: s.id,
      kind: 'SCAN' as const,
      engagementId: s.engagementId,
      engagementName: nameById.get(s.engagementId) ?? '',
      label: s.name ?? 'Scan',
      status: s.status as string,
      ts: s.completedAt ?? s.createdAt,
    })),
  ];

  items.sort((a, b) => b.ts.getTime() - a.ts.getTime());
  return items.slice(0, limit);
}
