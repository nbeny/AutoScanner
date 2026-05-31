import type { PrismaClient } from '@prisma/client';
import { getTopFindings } from '../get-top-findings';

describe('getTopFindings', () => {
  const engagementId = 'eng_1';

  function makeFinding(
    over: Partial<{
      id: string;
      assetId: string;
      dedupHash: string;
      title: string;
      severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
      cveId: string | null;
      firstSeenAt: Date;
      lastSeenAt: Date;
      scanJob: { scannerName: string };
    }>,
  ) {
    return {
      id: 'f',
      assetId: 'a',
      dedupHash: 'h',
      title: 't',
      severity: 'INFO' as const,
      cveId: null,
      firstSeenAt: new Date('2026-05-01T00:00:00Z'),
      lastSeenAt: new Date('2026-05-01T00:00:00Z'),
      scanJob: { scannerName: 'nuclei' },
      ...over,
    };
  }

  it('groups by dedupHash and returns one entry per group with affectedAssetCount + scannerSources', async () => {
    const prisma = {
      finding: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            makeFinding({
              id: 'f1',
              assetId: 'a1',
              dedupHash: 'h-CVE-2024-1',
              title: 'CVE-2024-1',
              severity: 'CRITICAL',
              cveId: 'CVE-2024-1',
              scanJob: { scannerName: 'nuclei' },
            }),
            makeFinding({
              id: 'f2',
              assetId: 'a2',
              dedupHash: 'h-CVE-2024-1',
              title: 'CVE-2024-1',
              severity: 'CRITICAL',
              cveId: 'CVE-2024-1',
              scanJob: { scannerName: 'nuclei' },
            }),
            makeFinding({
              id: 'f3',
              assetId: 'a1',
              dedupHash: 'h-Open-Dir',
              title: 'Open dir',
              severity: 'MEDIUM',
              cveId: null,
              scanJob: { scannerName: 'nuclei' },
            }),
          ]),
      },
    } as unknown as PrismaClient;

    const result = await getTopFindings(prisma, engagementId, 10);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      dedupHash: 'h-CVE-2024-1',
      title: 'CVE-2024-1',
      severity: 'CRITICAL',
      cveId: 'CVE-2024-1',
      affectedAssetCount: 2,
      scannerSources: ['nuclei'],
    });
    expect(result[1]).toMatchObject({
      dedupHash: 'h-Open-Dir',
      severity: 'MEDIUM',
      affectedAssetCount: 1,
    });
  });

  it('orders by severity rank desc then affectedAssetCount desc', async () => {
    const prisma = {
      finding: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            makeFinding({ id: 'f1', assetId: 'a1', dedupHash: 'h-MED', severity: 'MEDIUM' }),
            makeFinding({ id: 'f2', assetId: 'a2', dedupHash: 'h-MED', severity: 'MEDIUM' }),
            makeFinding({ id: 'f3', assetId: 'a3', dedupHash: 'h-MED', severity: 'MEDIUM' }),
            makeFinding({ id: 'f4', assetId: 'a1', dedupHash: 'h-HI', severity: 'HIGH' }),
          ]),
      },
    } as unknown as PrismaClient;

    const result = await getTopFindings(prisma, engagementId, 10);

    expect(result.map((r) => r.dedupHash)).toEqual(['h-HI', 'h-MED']);
  });

  it('respects the limit', async () => {
    const prisma = {
      finding: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            makeFinding({ id: 'a', assetId: 'a1', dedupHash: 'h1', severity: 'HIGH' }),
            makeFinding({ id: 'b', assetId: 'a1', dedupHash: 'h2', severity: 'HIGH' }),
            makeFinding({ id: 'c', assetId: 'a1', dedupHash: 'h3', severity: 'HIGH' }),
          ]),
      },
    } as unknown as PrismaClient;

    const result = await getTopFindings(prisma, engagementId, 2);

    expect(result).toHaveLength(2);
  });

  it('deduplicates assetId so the count is unique-asset (not finding-row count)', async () => {
    const prisma = {
      finding: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            makeFinding({ id: 'f1', assetId: 'a1', dedupHash: 'h', severity: 'HIGH' }),
            makeFinding({ id: 'f2', assetId: 'a1', dedupHash: 'h', severity: 'HIGH' }),
            makeFinding({ id: 'f3', assetId: 'a2', dedupHash: 'h', severity: 'HIGH' }),
          ]),
      },
    } as unknown as PrismaClient;

    const result = await getTopFindings(prisma, engagementId, 10);

    expect(result[0]).toMatchObject({ affectedAssetCount: 2 });
  });

  it('returns [] when no findings', async () => {
    const prisma = {
      finding: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaClient;

    const result = await getTopFindings(prisma, engagementId, 10);

    expect(result).toEqual([]);
  });
});
