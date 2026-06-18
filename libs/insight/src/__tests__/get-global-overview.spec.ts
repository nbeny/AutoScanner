import type { PrismaClient } from '@prisma/client';
import { getGlobalOverview } from '../get-global-overview';

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    engagement: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'e1', status: 'ACTIVE' },
        { id: 'e2', status: 'DRAFT' },
        { id: 'e3', status: 'ACTIVE' },
      ]),
    },
    domain: { count: jest.fn().mockResolvedValue(4) },
    subdomain: { count: jest.fn().mockResolvedValue(9) },
    ipAddress: { count: jest.fn().mockResolvedValue(5) },
    port: { count: jest.fn().mockResolvedValue(13) },
    technology: {
      findMany: jest.fn().mockResolvedValue([
        { name: 'nginx', version: '1.21' },
        { name: 'nginx', version: '1.21' },
        { name: 'react', version: '18.2' },
      ]),
    },
    finding: {
      groupBy: jest.fn().mockResolvedValue([
        { severity: 'CRITICAL', _count: { _all: 3 } },
        { severity: 'HIGH', _count: { _all: 6 } },
      ]),
    },
    schedule: { count: jest.fn().mockResolvedValue(2) },
    scan: { count: jest.fn().mockResolvedValue(1) },
    ...overrides,
  } as unknown as PrismaClient;
}

describe('getGlobalOverview', () => {
  it('aggregates attack surface, severity, schedules and running scans across owned engagements', async () => {
    const prisma = makePrisma();

    const overview = await getGlobalOverview(prisma, 'owner_1');

    expect(overview).toEqual({
      engagementsByStatus: { draft: 1, active: 2, paused: 0, completed: 0, archived: 0, total: 3 },
      domains: 4,
      subdomains: 9,
      ipAddresses: 5,
      openPorts: 13,
      uniqueTechs: 2,
      findingsBySeverity: { critical: 3, high: 6, medium: 0, low: 0, info: 0 },
      activeSchedules: 2,
      runningScans: 1,
    });
  });

  it('scopes every aggregate to the owner-owned, non-deleted engagement ids', async () => {
    const prisma = makePrisma();
    await getGlobalOverview(prisma, 'owner_1');

    expect(prisma.engagement.findMany as jest.Mock).toHaveBeenCalledWith({
      where: { ownerId: 'owner_1', deletedAt: null },
      select: { id: true, status: true },
    });
    expect(prisma.domain.count as jest.Mock).toHaveBeenCalledWith({
      where: { engagementId: { in: ['e1', 'e2', 'e3'] } },
    });
    expect(prisma.port.count as jest.Mock).toHaveBeenCalledWith({
      where: {
        state: 'OPEN',
        asset: { engagementId: { in: ['e1', 'e2', 'e3'] }, deletedAt: null },
      },
    });
    expect(prisma.schedule.count as jest.Mock).toHaveBeenCalledWith({
      where: { engagementId: { in: ['e1', 'e2', 'e3'] }, enabled: true, deletedAt: null },
    });
    expect(prisma.scan.count as jest.Mock).toHaveBeenCalledWith({
      where: { engagementId: { in: ['e1', 'e2', 'e3'] }, status: { in: ['RUNNING', 'QUEUED'] } },
    });
  });

  it('returns all-zero and issues no in:[] queries when the operator owns no engagements', async () => {
    const prisma = makePrisma({ engagement: { findMany: jest.fn().mockResolvedValue([]) } });

    const overview = await getGlobalOverview(prisma, 'owner_1');

    expect(overview.engagementsByStatus.total).toBe(0);
    expect(overview.domains).toBe(0);
    expect(overview.findingsBySeverity).toEqual({
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    });
    expect(prisma.domain.count as jest.Mock).not.toHaveBeenCalled();
    expect(prisma.scan.count as jest.Mock).not.toHaveBeenCalled();
  });
});
