import type { PrismaClient } from '@prisma/client';
import { getEngagementOverview } from '../get-engagement-overview';

describe('getEngagementOverview', () => {
  const engagementId = 'eng_1';

  it('aggregates counts across Domain, Subdomain, IpAddress, Port, Technology, Finding', async () => {
    const prisma = {
      domain: { count: jest.fn().mockResolvedValue(2) },
      subdomain: { count: jest.fn().mockResolvedValue(7) },
      ipAddress: { count: jest.fn().mockResolvedValue(3) },
      port: { count: jest.fn().mockResolvedValue(11) },
      technology: {
        findMany: jest.fn().mockResolvedValue([
          { name: 'nginx', version: '1.21' },
          { name: 'nginx', version: '1.21' },
          { name: 'react', version: '18.2' },
        ]),
      },
      finding: {
        groupBy: jest.fn().mockResolvedValue([
          { severity: 'CRITICAL', _count: { _all: 2 } },
          { severity: 'HIGH', _count: { _all: 5 } },
          { severity: 'MEDIUM', _count: { _all: 1 } },
        ]),
      },
    } as unknown as PrismaClient;

    const overview = await getEngagementOverview(prisma, engagementId);

    expect(overview).toEqual({
      domains: 2,
      subdomains: 7,
      ipAddresses: 3,
      openPorts: 11,
      uniqueTechs: 2,
      findingsBySeverity: { critical: 2, high: 5, medium: 1, low: 0, info: 0 },
    });
  });

  it('scopes Port count to state=OPEN and the engagement via asset relation', async () => {
    const portCount = jest.fn().mockResolvedValue(0);
    const prisma = {
      domain: { count: jest.fn().mockResolvedValue(0) },
      subdomain: { count: jest.fn().mockResolvedValue(0) },
      ipAddress: { count: jest.fn().mockResolvedValue(0) },
      port: { count: portCount },
      technology: { findMany: jest.fn().mockResolvedValue([]) },
      finding: { groupBy: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaClient;

    await getEngagementOverview(prisma, engagementId);

    expect(portCount).toHaveBeenCalledWith({
      where: {
        state: 'OPEN',
        asset: { engagementId, deletedAt: null },
      },
    });
  });

  it('excludes soft-deleted assets from Finding aggregation', async () => {
    const groupBy = jest.fn().mockResolvedValue([]);
    const prisma = {
      domain: { count: jest.fn().mockResolvedValue(0) },
      subdomain: { count: jest.fn().mockResolvedValue(0) },
      ipAddress: { count: jest.fn().mockResolvedValue(0) },
      port: { count: jest.fn().mockResolvedValue(0) },
      technology: { findMany: jest.fn().mockResolvedValue([]) },
      finding: { groupBy },
    } as unknown as PrismaClient;

    await getEngagementOverview(prisma, engagementId);

    expect(groupBy).toHaveBeenCalledWith({
      by: ['severity'],
      where: { asset: { engagementId, deletedAt: null } },
      _count: { _all: true },
    });
  });

  it('returns zero counts when nothing exists', async () => {
    const prisma = {
      domain: { count: jest.fn().mockResolvedValue(0) },
      subdomain: { count: jest.fn().mockResolvedValue(0) },
      ipAddress: { count: jest.fn().mockResolvedValue(0) },
      port: { count: jest.fn().mockResolvedValue(0) },
      technology: { findMany: jest.fn().mockResolvedValue([]) },
      finding: { groupBy: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaClient;

    const overview = await getEngagementOverview(prisma, engagementId);

    expect(overview).toEqual({
      domains: 0,
      subdomains: 0,
      ipAddresses: 0,
      openPorts: 0,
      uniqueTechs: 0,
      findingsBySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    });
  });
});
