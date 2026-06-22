import type { PrismaClient } from '@prisma/client';

export interface CoverageSummary {
  totalAssets: number;
  scannedAssets: number;
  percent: number;
}

export async function getCoverageSummary(
  prisma: PrismaClient,
  userId: string,
  engagementId?: string,
): Promise<CoverageSummary> {
  const engWhere = {
    ownerId: userId,
    deletedAt: null,
    ...(engagementId ? { id: engagementId } : {}),
  };

  const totalAssets = await prisma.asset.count({
    where: { engagement: engWhere, deletedAt: null },
  });

  const scannedRows = await prisma.assetObservation.groupBy({
    by: ['assetId'],
    where: { asset: { engagement: engWhere, deletedAt: null } },
  });

  const scannedAssets = scannedRows.length;
  const percent = totalAssets === 0 ? 0 : Math.round((scannedAssets / totalAssets) * 100);

  return { totalAssets, scannedAssets, percent };
}
