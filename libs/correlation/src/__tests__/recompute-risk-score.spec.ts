import type { PrismaClient } from '@prisma/client';
import { computeAssetRiskScore } from '../recompute-risk-score';

// Minimal PrismaLike mock. CVSS resolution now goes NvdCve → CveCache (SP2b defect 3), so both
// tables are mocked; nvdCve defaults to empty so tests exercise the CveCache fallback path.
function makePrisma(overrides: {
  assetFindUnique?: jest.Mock;
  nvdCveFindMany?: jest.Mock;
  cveCacheFindMany?: jest.Mock;
}) {
  return {
    asset: {
      findUnique: overrides.assetFindUnique ?? jest.fn().mockResolvedValue(null),
    },
    nvdCve: {
      findMany: overrides.nvdCveFindMany ?? jest.fn().mockResolvedValue([]),
    },
    cveCache: {
      findMany: overrides.cveCacheFindMany ?? jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaClient;
}

describe('computeAssetRiskScore', () => {
  it('throws when the asset is not found', async () => {
    const prisma = makePrisma({ assetFindUnique: jest.fn().mockResolvedValue(null) });

    await expect(computeAssetRiskScore(prisma, 'missing')).rejects.toThrow(
      /Asset not found: missing/,
    );
  });

  it('returns the computed score (basic: 1 CRITICAL cluster + sensitive port 22)', async () => {
    const prisma = makePrisma({
      assetFindUnique: jest.fn().mockResolvedValue({
        id: 'a1',
        correlatedFindings: [{ severity: 'CRITICAL', cveId: null, status: 'OPEN' }],
        ports: [{ number: 22, state: 'OPEN', services: [{ name: 'ssh', product: null }] }],
      }),
      cveCacheFindMany: jest.fn().mockResolvedValue([]),
    });

    const score = await computeAssetRiskScore(prisma, 'a1');

    // CRITICAL (10) + sensitive port 22 (+2) = 12
    expect(score).toBe(12);
  });

  it('uses the CVSS v3 score from the cache when NvdCve has none (HIGH cluster, cvss=9.8 → 9.8)', async () => {
    const prisma = makePrisma({
      assetFindUnique: jest.fn().mockResolvedValue({
        id: 'a2',
        correlatedFindings: [{ severity: 'HIGH', cveId: 'CVE-2024-1', status: 'OPEN' }],
        ports: [],
      }),
      cveCacheFindMany: jest.fn().mockResolvedValue([{ cveId: 'CVE-2024-1', cvssV3Score: 9.8 }]),
    });

    const score = await computeAssetRiskScore(prisma, 'a2');

    expect(score).toBeCloseTo(9.8);
    // NvdCve is consulted first, then CveCache for the CVEs it didn't score.
    expect((prisma.nvdCve as unknown as { findMany: jest.Mock }).findMany).toHaveBeenCalledWith({
      where: { cveId: { in: ['CVE-2024-1'] } },
      select: { cveId: true, cvssV3Score: true },
    });
    expect((prisma.cveCache as unknown as { findMany: jest.Mock }).findMany).toHaveBeenCalledWith({
      where: { cveId: { in: ['CVE-2024-1'] } },
      select: { cveId: true, cvssV3Score: true },
    });
  });

  it('prefers the NvdCve score over the cache for the same CVE', async () => {
    const prisma = makePrisma({
      assetFindUnique: jest.fn().mockResolvedValue({
        id: 'a2b',
        correlatedFindings: [{ severity: 'HIGH', cveId: 'CVE-2024-1', status: 'OPEN' }],
        ports: [],
      }),
      nvdCveFindMany: jest.fn().mockResolvedValue([{ cveId: 'CVE-2024-1', cvssV3Score: 9.8 }]),
      cveCacheFindMany: jest.fn().mockResolvedValue([{ cveId: 'CVE-2024-1', cvssV3Score: 4.0 }]),
    });

    const score = await computeAssetRiskScore(prisma, 'a2b');

    expect(score).toBeCloseTo(9.8);
    // NvdCve answered, so the cache is not queried for it.
    expect((prisma.cveCache as unknown as { findMany: jest.Mock }).findMany).not.toHaveBeenCalled();
  });

  it('falls back to severity weight when CVSS is null everywhere (HIGH → 5)', async () => {
    const prisma = makePrisma({
      assetFindUnique: jest.fn().mockResolvedValue({
        id: 'a3',
        correlatedFindings: [{ severity: 'HIGH', cveId: 'CVE-2024-2', status: 'OPEN' }],
        ports: [],
      }),
      cveCacheFindMany: jest.fn().mockResolvedValue([{ cveId: 'CVE-2024-2', cvssV3Score: null }]),
    });

    const score = await computeAssetRiskScore(prisma, 'a3');

    expect(score).toBe(5); // HIGH fallback
  });

  it('falls back to severity weight when the CVE is in neither table', async () => {
    const prisma = makePrisma({
      assetFindUnique: jest.fn().mockResolvedValue({
        id: 'a4',
        correlatedFindings: [{ severity: 'CRITICAL', cveId: 'CVE-2024-3', status: 'OPEN' }],
        ports: [],
      }),
      cveCacheFindMany: jest.fn().mockResolvedValue([]),
    });

    const score = await computeAssetRiskScore(prisma, 'a4');

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
    });

    const score = await computeAssetRiskScore(prisma, 'a5');

    expect(score).toBe(5); // only HIGH counted
  });

  it('does not query any CVSS table when there are no CVE ids in the clusters', async () => {
    const nvdCveFindMany = jest.fn().mockResolvedValue([]);
    const cveCacheFindMany = jest.fn().mockResolvedValue([]);
    const prisma = makePrisma({
      assetFindUnique: jest.fn().mockResolvedValue({
        id: 'a6',
        correlatedFindings: [{ severity: 'MEDIUM', cveId: null, status: 'OPEN' }],
        ports: [],
      }),
      nvdCveFindMany,
      cveCacheFindMany,
    });

    await computeAssetRiskScore(prisma, 'a6');

    expect(nvdCveFindMany).not.toHaveBeenCalled();
    expect(cveCacheFindMany).not.toHaveBeenCalled();
  });

  it('queries correlatedFindings and ports with the exact selection', () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 'a7',
      correlatedFindings: [],
      ports: [],
    });
    const prisma = makePrisma({ assetFindUnique: findUnique });

    return computeAssetRiskScore(prisma, 'a7').then(() => {
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

  it('deduplicates cveIds before querying (multiple clusters, same CVE → one lookup)', async () => {
    const nvdCveFindMany = jest
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
      nvdCveFindMany,
    });

    await computeAssetRiskScore(prisma, 'a8');

    expect(nvdCveFindMany).toHaveBeenCalledTimes(1);
    const [callArg] = nvdCveFindMany.mock.calls[0] as [{ where: { cveId: { in: string[] } } }];
    expect(callArg.where.cveId.in).toEqual(['CVE-2024-99']);
  });
});
