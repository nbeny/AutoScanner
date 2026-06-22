import type { PrismaClient } from '@prisma/client';

export interface SeverityTrendBucket {
  bucketDate: string; // 'yyyy-MM-dd'
  counts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
}

const ZERO_COUNTS = () => ({ critical: 0, high: 0, medium: 0, low: 0, info: 0 });

export async function getSeverityTrend(
  prisma: PrismaClient,
  userId: string,
  engagementId: string | undefined,
  days: number,
): Promise<SeverityTrendBucket[]> {
  const cutoff = new Date(Date.now() - days * 86400000);

  const findings = await prisma.finding.findMany({
    where: {
      asset: {
        engagement: {
          ownerId: userId,
          deletedAt: null,
          ...(engagementId ? { id: engagementId } : {}),
        },
        deletedAt: null,
      },
      firstSeenAt: { gte: cutoff },
    },
    select: {
      firstSeenAt: true,
      severity: true,
    },
    take: 100000,
  });

  const bucketMap = new Map<string, ReturnType<typeof ZERO_COUNTS>>();

  for (const finding of findings) {
    const bucketDate = finding.firstSeenAt.toISOString().slice(0, 10);
    if (!bucketMap.has(bucketDate)) {
      bucketMap.set(bucketDate, ZERO_COUNTS());
    }
    const counts = bucketMap.get(bucketDate)!;
    const sev = finding.severity as string;
    if (sev === 'CRITICAL') counts.critical += 1;
    else if (sev === 'HIGH') counts.high += 1;
    else if (sev === 'MEDIUM') counts.medium += 1;
    else if (sev === 'LOW') counts.low += 1;
    else if (sev === 'INFO') counts.info += 1;
  }

  return Array.from(bucketMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucketDate, counts]) => ({ bucketDate, counts }));
}
