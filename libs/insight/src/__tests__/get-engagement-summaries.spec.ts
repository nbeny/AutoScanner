import type { PrismaClient } from '@prisma/client';
import { getEngagementSummaries } from '../get-engagement-summaries';

describe('getEngagementSummaries', () => {
  function makePrisma(overrides: Record<string, unknown> = {}) {
    return {
      engagement: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'e1',
            name: 'Acme',
            clientName: 'Acme Corp',
            status: 'ACTIVE',
            createdAt: new Date('2026-06-01T00:00:00Z'),
          },
          {
            id: 'e2',
            name: 'Globex',
            clientName: 'Globex Inc',
            status: 'DRAFT',
            createdAt: new Date('2026-06-10T00:00:00Z'),
          },
        ]),
      },
      asset: {
        groupBy: jest.fn().mockResolvedValue([{ engagementId: 'e1', _count: { _all: 12 } }]),
      },
      finding: {
        findMany: jest.fn().mockResolvedValue([
          { severity: 'CRITICAL', asset: { engagementId: 'e1' } },
          { severity: 'CRITICAL', asset: { engagementId: 'e1' } },
          { severity: 'LOW', asset: { engagementId: 'e1' } },
        ]),
      },
      scan: {
        groupBy: jest.fn().mockResolvedValue([
          {
            engagementId: 'e1',
            _max: {
              createdAt: new Date('2026-06-15T00:00:00Z'),
              completedAt: new Date('2026-06-16T00:00:00Z'),
            },
          },
        ]),
      },
      templateRun: {
        groupBy: jest.fn().mockResolvedValue([]),
      },
      ...overrides,
    } as unknown as PrismaClient;
  }

  it('builds one card per engagement with asset count, severity breakdown and last activity', async () => {
    const summaries = await getEngagementSummaries(makePrisma(), 'owner_1');

    const e1 = summaries.find((s) => s.id === 'e1');
    expect(e1).toMatchObject({
      name: 'Acme',
      clientName: 'Acme Corp',
      status: 'ACTIVE',
      assetCount: 12,
      findingsBySeverity: { critical: 2, high: 0, medium: 0, low: 1, info: 0 },
      lastActivityAt: new Date('2026-06-16T00:00:00Z'),
    });
  });

  it('falls back to createdAt for last activity and zero counts when no rollups exist', async () => {
    const summaries = await getEngagementSummaries(makePrisma(), 'owner_1');

    const e2 = summaries.find((s) => s.id === 'e2');
    expect(e2).toMatchObject({
      assetCount: 0,
      findingsBySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      lastActivityAt: new Date('2026-06-10T00:00:00Z'),
    });
  });

  it('orders engagements by last activity descending', async () => {
    const summaries = await getEngagementSummaries(makePrisma(), 'owner_1');
    expect(summaries.map((s) => s.id)).toEqual(['e1', 'e2']);
  });

  it('returns empty without further queries when no engagements are owned', async () => {
    const prisma = makePrisma({ engagement: { findMany: jest.fn().mockResolvedValue([]) } });
    const summaries = await getEngagementSummaries(prisma, 'owner_1');

    expect(summaries).toEqual([]);
    expect(prisma.asset.groupBy as jest.Mock).not.toHaveBeenCalled();
  });
});
