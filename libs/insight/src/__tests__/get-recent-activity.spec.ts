import type { PrismaClient } from '@prisma/client';
import { getRecentActivity } from '../get-recent-activity';

describe('getRecentActivity', () => {
  function makePrisma(overrides: Record<string, unknown> = {}) {
    return {
      engagement: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'e1', name: 'Acme' },
          { id: 'e2', name: 'Globex' },
        ]),
      },
      templateRun: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'tr1',
            templateName: 'full-recon',
            status: 'COMPLETED',
            engagementId: 'e1',
            startedAt: new Date('2026-06-18T10:00:00Z'),
            completedAt: new Date('2026-06-18T10:30:00Z'),
            createdAt: new Date('2026-06-18T09:59:00Z'),
          },
        ]),
      },
      scan: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 's1',
            name: 'nmap',
            status: 'RUNNING',
            engagementId: 'e2',
            completedAt: null,
            createdAt: new Date('2026-06-18T11:00:00Z'),
          },
        ]),
      },
      ...overrides,
    } as unknown as PrismaClient;
  }

  it('merges template runs and scans, sorted by most-relevant timestamp desc, joined to engagement name', async () => {
    const items = await getRecentActivity(makePrisma(), 'owner_1', 15);

    expect(items).toHaveLength(2);
    // scan ts (11:00, createdAt) is newer than template run ts (10:30, completedAt)
    expect(items[0]).toMatchObject({
      id: 's1',
      kind: 'SCAN',
      engagementName: 'Globex',
      label: 'nmap',
      ts: new Date('2026-06-18T11:00:00Z'),
    });
    expect(items[1]).toMatchObject({
      id: 'tr1',
      kind: 'TEMPLATE_RUN',
      engagementName: 'Acme',
      label: 'full-recon',
      ts: new Date('2026-06-18T10:30:00Z'),
    });
  });

  it('clamps the merged result to limit', async () => {
    const items = await getRecentActivity(makePrisma(), 'owner_1', 1);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('s1');
  });

  it('returns empty and queries nothing further when the operator owns no engagements', async () => {
    const prisma = makePrisma({ engagement: { findMany: jest.fn().mockResolvedValue([]) } });
    const items = await getRecentActivity(prisma, 'owner_1', 15);

    expect(items).toEqual([]);
    expect(prisma.scan.findMany as jest.Mock).not.toHaveBeenCalled();
  });
});
