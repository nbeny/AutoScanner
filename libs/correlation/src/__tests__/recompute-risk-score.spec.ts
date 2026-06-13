import type { PrismaClient } from '@prisma/client';
import { recomputeRiskScoreForAsset } from '../recompute-risk-score';

// Helper to build a minimal PrismaLike mock.
function makePrisma(overrides: {
  assetFindUnique?: jest.Mock;
  cveCacheFindMany?: jest.Mock;
  assetUpdate?: jest.Mock;
}) {
  return {
    asset: {
      findUnique: overrides.assetFindUnique ?? jest.fn().mockResolvedValue(null),
      update: overrides.assetUpdate ?? jest.fn().mockResolvedValue({}),
    },
    cveCache: {
      findMany: overrides.cveCacheFindMany ?? jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaClient;
}

describe('recomputeRiskScoreForAsset', () => {
  it('throws when the asset is not found', async () => {
    const prisma = makePrisma({ assetFindUnique: jest.fn().mockResolvedValue(null) });

    await expect(recomputeRiskScoreForAsset(prisma, 'missing')).rejects.toThrow(
      /Asset not found: missing/,
    );
    expect((prisma.asset as unknown as { update: jest.Mock }).update).not.toHaveBeenCalled();
  });

  it('writes the computed score back to Asset.riskScore (basic: 1 CRITICAL cluster + sensitive port 22)', async () => {
    const prisma = makePrisma({
      assetFindUnique: jest.fn().mockResolvedValue({
        id: 'a1',
        correlatedFindings: [{ severity: 'CRITICAL', cveId: null, status: 'OPEN' }],
        ports: [{ number: 22, state: 'OPEN', services: [{ name: 'ssh', product: null }] }],
      }),
      // No CVE → cveCache query returns empty (cveIds is empty, so findMany not called at all)
      cveCacheFindMany: jest.fn().mockResolvedValue([]),
      assetUpdate: jest.fn().mockResolvedValue({ id: 'a1' }),
    });

    const score = await recomputeRiskScoreForAsset(prisma, 'a1');

    // CRITICAL (10) + sensitive port 22 (+2) = 12
    expect(score).toBe(12);
    expect((prisma.asset as unknown as { update: jest.Mock }).update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { riskScore: 12 },
    });
  });

  it('uses CVSS v3 score from CveCache when available (HIGH cluster with cvss=9.8 → 9.8)', async () => {
    const prisma = makePrisma({
      assetFindUnique: jest.fn().mockResolvedValue({
        id: 'a2',
        correlatedFindings: [{ severity: 'HIGH', cveId: 'CVE-2024-1', status: 'OPEN' }],
        ports: [],
      }),
      cveCacheFindMany: jest.fn().mockResolvedValue([{ cveId: 'CVE-2024-1', cvssV3Score: 9.8 }]),
      assetUpdate: jest.fn().mockResolvedValue({ id: 'a2' }),
    });

    const score = await recomputeRiskScoreForAsset(prisma, 'a2');

    expect(score).toBeCloseTo(9.8);
    // CVSS lookup should have been called with the distinct CVE ids.
    expect((prisma.cveCache as unknown as { findMany: jest.Mock }).findMany).toHaveBeenCalledWith({
      where: { cveId: { in: ['CVE-2024-1'] } },
      select: { cveId: true, cvssV3Score: true },
    });
  });

  it('falls back to severity weight when CVSS is null in cache (HIGH → 5)', async () => {
    const prisma = makePrisma({
      assetFindUnique: jest.fn().mockResolvedValue({
        id: 'a3',
        correlatedFindings: [{ severity: 'HIGH', cveId: 'CVE-2024-2', status: 'OPEN' }],
        ports: [],
      }),
      cveCacheFindMany: jest.fn().mockResolvedValue([{ cveId: 'CVE-2024-2', cvssV3Score: null }]),
      assetUpdate: jest.fn().mockResolvedValue({ id: 'a3' }),
    });

    const score = await recomputeRiskScoreForAsset(prisma, 'a3');

    expect(score).toBe(5); // HIGH fallback
  });

  it('falls back to severity weight when CVE is not in cache', async () => {
    const prisma = makePrisma({
      assetFindUnique: jest.fn().mockResolvedValue({
        id: 'a4',
        correlatedFindings: [{ severity: 'CRITICAL', cveId: 'CVE-2024-3', status: 'OPEN' }],
        ports: [],
      }),
      // Cache miss — findMany returns empty
      cveCacheFindMany: jest.fn().mockResolvedValue([]),
      assetUpdate: jest.fn().mockResolvedValue({ id: 'a4' }),
    });

    const score = await recomputeRiskScoreForAsset(prisma, 'a4');

    expect(score).toBe(10); // CRITICAL fallback
  });

  it('excludes FALSE_POSITIVE and RESOLVED clusters from the score', async () => {
    const prisma = makePrisma({
      assetFindUnique: jest.fn().mockResolvedValue({
        id: 'a5',
        correlatedFindings: [
          { severity: 'CRITICAL', cveId: null, status: 'FALSE_POSITIVE' },
          { severity: 'CRITICAL', cveId: null, status: 'RESOLVED' },
          { severity: 'HIGH', cveId: null, status: 'OPEN' },
        ],
        ports: [],
      }),
      cveCacheFindMany: jest.fn().mockResolvedValue([]),
      assetUpdate: jest.fn().mockResolvedValue({ id: 'a5' }),
    });

    const score = await recomputeRiskScoreForAsset(prisma, 'a5');

    expect(score).toBe(5); // only HIGH counted
  });

  it('does not call cveCache.findMany when there are no CVE ids in the clusters', async () => {
    const cveCacheFindMany = jest.fn().mockResolvedValue([]);
    const prisma = makePrisma({
      assetFindUnique: jest.fn().mockResolvedValue({
        id: 'a6',
        correlatedFindings: [{ severity: 'MEDIUM', cveId: null, status: 'OPEN' }],
        ports: [],
      }),
      cveCacheFindMany,
      assetUpdate: jest.fn().mockResolvedValue({ id: 'a6' }),
    });

    await recomputeRiskScoreForAsset(prisma, 'a6');

    expect(cveCacheFindMany).not.toHaveBeenCalled();
  });

  it('queries correlatedFindings (severity, cveId, status) and ports.services (name, product) and ports.state/number', () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 'a7',
      correlatedFindings: [],
      ports: [],
    });
    const prisma = makePrisma({
      assetFindUnique: findUnique,
      assetUpdate: jest.fn().mockResolvedValue({ id: 'a7' }),
    });

    return recomputeRiskScoreForAsset(prisma, 'a7').then(() => {
      expect(findUnique).toHaveBeenCalledWith({
        where: { id: 'a7' },
        select: {
          id: true,
          correlatedFindings: { select: { severity: true, cveId: true, status: true } },
          ports: {
            select: {
              number: true,
              state: true,
              services: { select: { name: true, product: true } },
            },
          },
        },
      });
    });
  });

  it('deduplicates cveIds before querying the cache (multiple clusters with same CVE → one lookup)', async () => {
    const cveCacheFindMany = jest
      .fn()
      .mockResolvedValue([{ cveId: 'CVE-2024-99', cvssV3Score: 8.1 }]);
    const prisma = makePrisma({
      assetFindUnique: jest.fn().mockResolvedValue({
        id: 'a8',
        correlatedFindings: [
          { severity: 'HIGH', cveId: 'CVE-2024-99', status: 'OPEN' },
          { severity: 'CRITICAL', cveId: 'CVE-2024-99', status: 'OPEN' },
        ],
        ports: [],
      }),
      cveCacheFindMany,
      assetUpdate: jest.fn().mockResolvedValue({ id: 'a8' }),
    });

    await recomputeRiskScoreForAsset(prisma, 'a8');

    // findMany called once with a single deduplicated cveId.
    expect(cveCacheFindMany).toHaveBeenCalledTimes(1);
    const [callArg] = cveCacheFindMany.mock.calls[0] as [{ where: { cveId: { in: string[] } } }];
    expect(callArg.where.cveId.in).toEqual(['CVE-2024-99']);
  });
});
