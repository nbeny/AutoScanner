import type { PrismaClient, Severity } from '@prisma/client';

export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface EngagementOverview {
  domains: number;
  subdomains: number;
  ipAddresses: number;
  openPorts: number;
  uniqueTechs: number;
  findingsBySeverity: SeverityCounts;
}

const ZERO_SEVERITY: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };

export async function getEngagementOverview(
  prisma: PrismaClient,
  engagementId: string,
): Promise<EngagementOverview> {
  const [domains, subdomains, ipAddresses, openPorts, techs, severityRows] = await Promise.all([
    prisma.domain.count({ where: { engagementId } }),
    prisma.subdomain.count({ where: { engagementId } }),
    prisma.ipAddress.count({ where: { engagementId } }),
    prisma.port.count({
      where: { state: 'OPEN', asset: { engagementId, deletedAt: null } },
    }),
    prisma.technology.findMany({
      where: { asset: { engagementId, deletedAt: null } },
      select: { name: true, version: true },
    }),
    prisma.finding.groupBy({
      by: ['severity'],
      where: { asset: { engagementId, deletedAt: null } },
      _count: { _all: true },
    }),
  ]);

  const uniqueTechKeys = new Set<string>();
  for (const t of techs) uniqueTechKeys.add(`${t.name}@${t.version ?? ''}`);

  const findingsBySeverity = { ...ZERO_SEVERITY };
  for (const row of severityRows) {
    const sev = row.severity as Severity;
    const n = (row as { _count: { _all: number } })._count._all;
    if (sev === 'CRITICAL') findingsBySeverity.critical = n;
    else if (sev === 'HIGH') findingsBySeverity.high = n;
    else if (sev === 'MEDIUM') findingsBySeverity.medium = n;
    else if (sev === 'LOW') findingsBySeverity.low = n;
    else if (sev === 'INFO') findingsBySeverity.info = n;
  }

  return {
    domains,
    subdomains,
    ipAddresses,
    openPorts,
    uniqueTechs: uniqueTechKeys.size,
    findingsBySeverity,
  };
}
