import type { PrismaClient, TemplateRunStatus } from '@prisma/client';

export interface RecentTemplateRun {
  id: string;
  templateName: string;
  status: TemplateRunStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  newAssetsCount: number;
  newFindingsCount: number;
}

export async function getRecentTemplateRuns(
  prisma: PrismaClient,
  engagementId: string,
  limit: number,
): Promise<RecentTemplateRun[]> {
  const runs = await prisma.templateRun.findMany({
    where: { engagementId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      templateName: true,
      status: true,
      startedAt: true,
      completedAt: true,
      createdAt: true,
    },
  });

  const now = new Date();
  const deltas = await Promise.all(
    runs.map(async (r) => {
      const from = r.startedAt ?? r.createdAt;
      const to = r.completedAt ?? now;
      const [newAssets, newFindings] = await Promise.all([
        prisma.asset.count({
          where: {
            engagementId,
            deletedAt: null,
            firstSeenAt: { gte: from, lte: to },
          },
        }),
        prisma.finding.count({
          where: {
            asset: { engagementId, deletedAt: null },
            firstSeenAt: { gte: from, lte: to },
          },
        }),
      ]);
      return { newAssets, newFindings };
    }),
  );

  return runs.map((r, i) => ({
    id: r.id,
    templateName: r.templateName,
    status: r.status,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    durationMs:
      r.startedAt && r.completedAt ? r.completedAt.getTime() - r.startedAt.getTime() : null,
    newAssetsCount: deltas[i]?.newAssets ?? 0,
    newFindingsCount: deltas[i]?.newFindings ?? 0,
  }));
}
