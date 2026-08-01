import type { PrismaClient } from '@prisma/client';
import { getTopAssets } from '../get-top-assets';

describe('getTopAssets (ranked by Asset.riskScore)', () => {
  const engagementId = 'eng_1';

  it('returns top N assets sorted by total findings count desc', async () => {
    const prisma = {
      asset: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'a1',
            type: 'SUBDOMAIN',
            canonicalValue: 'api.client.com',
            firstSeenAt: new Date('2026-05-01'),
            lastSeenAt: new Date('2026-05-02'),
            findings: [{ severity: 'CRITICAL' }, { severity: 'HIGH' }, { severity: 'HIGH' }],
          },
          {
            id: 'a2',
            type: 'IP_ADDRESS',
            canonicalValue: '10.0.0.1',
            firstSeenAt: new Date('2026-05-01'),
            lastSeenAt: new Date('2026-05-02'),
            findings: [{ severity: 'MEDIUM' }],
          },
          {
            id: 'a3',
            type: 'SUBDOMAIN',
            canonicalValue: 'www.client.com',
            firstSeenAt: new Date('2026-05-01'),
            lastSeenAt: new Date('2026-05-02'),
            findings: [],
          },
        ]),
      },
    } as unknown as PrismaClient;

    const result = await getTopAssets(prisma, engagementId, 10);

    expect(result.map((a) => a.id)).toEqual(['a1', 'a2', 'a3']);
    expect(result[0]).toMatchObject({
      id: 'a1',
      kind: 'SUBDOMAIN',
      canonicalValue: 'api.client.com',
      findingsCount: 3,
      criticalCount: 1,
      highCount: 2,
    });
  });

  it('lets the query do the ranking and limiting instead of loading the whole engagement', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { asset: { findMany } } as unknown as PrismaClient;

    await getTopAssets(prisma, engagementId, 5);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 5,
        orderBy: [{ riskScore: 'desc' }, { canonicalValue: 'asc' }],
      }),
    );
  });

  it('filters by engagementId + non-soft-deleted', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { asset: { findMany } } as unknown as PrismaClient;

    await getTopAssets(prisma, engagementId, 10);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { engagementId, deletedAt: null },
      }),
    );
  });

  it('returns [] when no assets', async () => {
    const prisma = {
      asset: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaClient;
    expect(await getTopAssets(prisma, engagementId, 10)).toEqual([]);
  });
});
