import type { EngagementStatus, PrismaClient, Severity } from '@prisma/client';
import type { SeverityCounts } from './get-engagement-overview';

export interface EngagementsByStatus {
  draft: number;
  active: number;
  paused: number;
  completed: number;
  archived: number;
  total: number;
}

export interface GlobalOverview {
  engagementsByStatus: EngagementsByStatus;
  domains: number;
  subdomains: number;
  ipAddresses: number;
  openPorts: number;
  uniqueTechs: number;
  findingsBySeverity: SeverityCounts;
  activeSchedules: number;
  runningScans: number;
}

const ZERO_SEVERITY: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
const ZERO_STATUS: EngagementsByStatus = {
  draft: 0,
  active: 0,
  paused: 0,
  completed: 0,
  archived: 0,
  total: 0,
};

function emptyOverview(): GlobalOverview {
  return {
    engagementsByStatus: { ...ZERO_STATUS },
    domains: 0,
    subdomains: 0,
    ipAddresses: 0,
    openPorts: 0,
    uniqueTechs: 0,
    findingsBySeverity: { ...ZERO_SEVERITY },
    activeSchedules: 0,
    runningScans: 0,
  };
}

function tallyStatus(rows: { status: EngagementStatus }[]): EngagementsByStatus {
  const counts: EngagementsByStatus = { ...ZERO_STATUS, total: rows.length };
  for (const row of rows) {
    if (row.status === 'DRAFT') counts.draft += 1;
    else if (row.status === 'ACTIVE') counts.active += 1;
    else if (row.status === 'PAUSED') counts.paused += 1;
    else if (row.status === 'COMPLETED') counts.completed += 1;
    else if (row.status === 'ARCHIVED') counts.archived += 1;
  }
  return counts;
}

/**
 * Aggregates attack-surface, severity, schedule and scan posture across every
 * engagement owned by `ownerId`. Owner-scoped: only the operator's own,
 * non-deleted engagements contribute. Returns all-zero when the operator owns
 * no engagements (no `in: []` queries are issued).
 */
export async function getGlobalOverview(
  prisma: PrismaClient,
  ownerId: string,
): Promise<GlobalOverview> {
  const engagements = await prisma.engagement.findMany({
    where: { ownerId, deletedAt: null },
    select: { id: true, status: true },
  });

  if (engagements.length === 0) return emptyOverview();

  const ids = engagements.map((e) => e.id);

  const [
    domains,
    subdomains,
    ipAddresses,
    openPorts,
    techs,
    severityRows,
    activeSchedules,
    runningScans,
  ] = await Promise.all([
    prisma.domain.count({ where: { engagementId: { in: ids } } }),
    prisma.subdomain.count({ where: { engagementId: { in: ids } } }),
    prisma.ipAddress.count({ where: { engagementId: { in: ids } } }),
    prisma.port.count({
      where: { state: 'OPEN', asset: { engagementId: { in: ids }, deletedAt: null } },
    }),
    prisma.technology.findMany({
      where: { asset: { engagementId: { in: ids }, deletedAt: null } },
      select: { name: true, version: true },
    }),
    prisma.finding.groupBy({
      by: ['severity'],
      where: { asset: { engagementId: { in: ids }, deletedAt: null } },
      _count: { _all: true },
    }),
    prisma.schedule.count({
      where: { engagementId: { in: ids }, enabled: true, deletedAt: null },
    }),
    prisma.scan.count({
      where: { engagementId: { in: ids }, status: { in: ['RUNNING', 'QUEUED'] } },
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
    engagementsByStatus: tallyStatus(engagements),
    domains,
    subdomains,
    ipAddresses,
    openPorts,
    uniqueTechs: uniqueTechKeys.size,
    findingsBySeverity,
    activeSchedules,
    runningScans,
  };
}
