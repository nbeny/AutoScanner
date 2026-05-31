import type { PrismaClient } from '@prisma/client';
import { getRecentTemplateRuns } from '../get-recent-template-runs';

describe('getRecentTemplateRuns', () => {
  const engagementId = 'eng_1';

  function withRuns(runs: unknown[], assetCounts: number[], findingCounts: number[]) {
    let assetCallIdx = 0;
    let findingCallIdx = 0;
    return {
      templateRun: { findMany: jest.fn().mockResolvedValue(runs) },
      asset: {
        count: jest
          .fn()
          .mockImplementation(() => Promise.resolve(assetCounts[assetCallIdx++] ?? 0)),
      },
      finding: {
        count: jest
          .fn()
          .mockImplementation(() => Promise.resolve(findingCounts[findingCallIdx++] ?? 0)),
      },
    } as unknown as PrismaClient;
  }

  it('returns runs ordered by createdAt desc with delta counts per run', async () => {
    const t0 = new Date('2026-05-01T10:00:00Z');
    const t1 = new Date('2026-05-01T10:05:00Z');
    const prisma = withRuns(
      [
        {
          id: 'run_2',
          templateName: 'web-quick',
          status: 'COMPLETED',
          startedAt: t0,
          completedAt: t1,
          createdAt: t0,
        },
        {
          id: 'run_1',
          templateName: 'recon-passive',
          status: 'COMPLETED',
          startedAt: new Date('2026-04-30T10:00:00Z'),
          completedAt: new Date('2026-04-30T10:02:00Z'),
          createdAt: new Date('2026-04-30T10:00:00Z'),
        },
      ],
      [12, 5],
      [3, 1],
    );

    const result = await getRecentTemplateRuns(prisma, engagementId, 5);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: 'run_2',
      templateName: 'web-quick',
      status: 'COMPLETED',
      durationMs: 5 * 60 * 1000,
      newAssetsCount: 12,
      newFindingsCount: 3,
    });
    expect(result[1]).toMatchObject({
      id: 'run_1',
      templateName: 'recon-passive',
      newAssetsCount: 5,
      newFindingsCount: 1,
    });
  });

  it('uses now() as upper bound when a run is still RUNNING', async () => {
    const t0 = new Date('2026-05-01T10:00:00Z');
    const assetCount = jest.fn().mockResolvedValue(0);
    const prisma = {
      templateRun: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'r',
            templateName: 't',
            status: 'RUNNING',
            startedAt: t0,
            completedAt: null,
            createdAt: t0,
          },
        ]),
      },
      asset: { count: assetCount },
      finding: { count: jest.fn().mockResolvedValue(0) },
    } as unknown as PrismaClient;

    await getRecentTemplateRuns(prisma, engagementId, 5);

    const callArg = assetCount.mock.calls[0]?.[0] as { where: { firstSeenAt: { lte: Date } } };
    expect(callArg.where.firstSeenAt.lte.getTime()).toBeGreaterThanOrEqual(t0.getTime());
  });

  it('falls back to createdAt as lower bound when startedAt is null (PENDING)', async () => {
    const created = new Date('2026-05-01T10:00:00Z');
    const assetCount = jest.fn().mockResolvedValue(0);
    const prisma = {
      templateRun: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'r',
            templateName: 't',
            status: 'PENDING',
            startedAt: null,
            completedAt: null,
            createdAt: created,
          },
        ]),
      },
      asset: { count: assetCount },
      finding: { count: jest.fn().mockResolvedValue(0) },
    } as unknown as PrismaClient;

    await getRecentTemplateRuns(prisma, engagementId, 5);

    const callArg = assetCount.mock.calls[0]?.[0] as { where: { firstSeenAt: { gte: Date } } };
    expect(callArg.where.firstSeenAt.gte).toEqual(created);
  });

  it('durationMs is null when completedAt is null', async () => {
    const t0 = new Date('2026-05-01T10:00:00Z');
    const prisma = {
      templateRun: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'r',
            templateName: 't',
            status: 'RUNNING',
            startedAt: t0,
            completedAt: null,
            createdAt: t0,
          },
        ]),
      },
      asset: { count: jest.fn().mockResolvedValue(0) },
      finding: { count: jest.fn().mockResolvedValue(0) },
    } as unknown as PrismaClient;

    const result = await getRecentTemplateRuns(prisma, engagementId, 5);

    expect(result[0]?.durationMs).toBeNull();
  });

  it('returns [] when no runs', async () => {
    const prisma = {
      templateRun: { findMany: jest.fn().mockResolvedValue([]) },
      asset: { count: jest.fn() },
      finding: { count: jest.fn() },
    } as unknown as PrismaClient;

    expect(await getRecentTemplateRuns(prisma, engagementId, 5)).toEqual([]);
  });
});
