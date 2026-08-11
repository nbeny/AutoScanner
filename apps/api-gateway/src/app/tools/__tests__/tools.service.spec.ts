import type { PrismaService } from '@autoscanner/database';

import { ToolsService } from '../tools.service';

describe('ToolsService', () => {
  let prisma: Record<string, unknown>;
  let svc: ToolsService;
  const userId = 'user_1';

  beforeEach(() => {
    prisma = {
      engagement: { findFirst: jest.fn() },
      scanJob: { findMany: jest.fn().mockResolvedValue([]) },
    };
    svc = new ToolsService(prisma as unknown as PrismaService);
  });

  it('toolActivity aggregates executions, success/failure and median per scanner', async () => {
    (prisma as any).engagement = { findFirst: jest.fn().mockResolvedValue({ id: 'e1' }) };
    (prisma as any).scanJob = {
      findMany: jest.fn().mockResolvedValue([
        {
          scannerName: 'nmap',
          status: 'COMPLETED',
          durationMs: 100,
          completedAt: new Date('2026-01-02'),
        },
        {
          scannerName: 'nmap',
          status: 'FAILED',
          durationMs: 300,
          completedAt: new Date('2026-01-03'),
        },
      ]),
    };
    const res = await svc.toolActivity(userId, { engagementId: 'e1' });
    const nmap = res.find((t) => t.scannerName === 'nmap');
    expect(nmap).toMatchObject({
      totalExecutions: 2,
      successCount: 1,
      failureCount: 1,
      medianDurationMs: 200,
    });
  });

  it('throws NotFoundError when engagementId is provided but engagement is not owned by user', async () => {
    (prisma as any).engagement = { findFirst: jest.fn().mockResolvedValue(null) };
    await expect(svc.toolActivity(userId, { engagementId: 'e_unknown' })).rejects.toThrow(
      /Engagement/,
    );
  });

  it('returns empty array when there are no scan jobs', async () => {
    (prisma as any).engagement = { findFirst: jest.fn().mockResolvedValue({ id: 'e1' }) };
    (prisma as any).scanJob = { findMany: jest.fn().mockResolvedValue([]) };
    const res = await svc.toolActivity(userId, { engagementId: 'e1' });
    expect(res).toEqual([]);
  });

  it('returns null medianDurationMs when no durationMs values exist', async () => {
    (prisma as any).engagement = { findFirst: jest.fn().mockResolvedValue(null) };
    (prisma as any).scanJob = {
      findMany: jest.fn().mockResolvedValue([
        {
          scannerName: 'masscan',
          status: 'COMPLETED',
          durationMs: null,
          completedAt: new Date('2026-01-01'),
        },
      ]),
    };
    // no engagementId → no ownership check
    const res = await svc.toolActivity(userId, {});
    const row = res.find((t) => t.scannerName === 'masscan');
    expect(row?.medianDurationMs).toBeNull();
  });

  it('computes median correctly for odd number of durations', async () => {
    (prisma as any).scanJob = {
      findMany: jest.fn().mockResolvedValue([
        { scannerName: 'nmap', status: 'COMPLETED', durationMs: 100, completedAt: new Date() },
        { scannerName: 'nmap', status: 'COMPLETED', durationMs: 200, completedAt: new Date() },
        { scannerName: 'nmap', status: 'COMPLETED', durationMs: 300, completedAt: new Date() },
      ]),
    };
    const res = await svc.toolActivity(userId, {});
    const nmap = res.find((t) => t.scannerName === 'nmap');
    expect(nmap?.medianDurationMs).toBe(200);
  });

  it('counts TIMEOUT jobs as failures', async () => {
    (prisma as any).scanJob = {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { scannerName: 'nmap', status: 'TIMEOUT', durationMs: 500, completedAt: new Date() },
        ]),
    };
    const res = await svc.toolActivity(userId, {});
    const nmap = res.find((t) => t.scannerName === 'nmap');
    expect(nmap?.failureCount).toBe(1);
    expect(nmap?.successCount).toBe(0);
  });

  it('does not check ownership when engagementId is omitted', async () => {
    const findFirst = jest.fn();
    (prisma as any).engagement = { findFirst };
    (prisma as any).scanJob = { findMany: jest.fn().mockResolvedValue([]) };
    await svc.toolActivity(userId, {});
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('toolDetail returns run history, recurring errors and agent stats', async () => {
    (prisma as any).engagement = { findFirst: jest.fn().mockResolvedValue({ id: 'e1' }) };
    (prisma as any).scanJob = {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'j1',
          status: 'FAILED',
          durationMs: 10,
          exitCode: 1,
          errorMessage: 'boom',
          completedAt: new Date(),
          agentId: 'ag1',
        },
        {
          id: 'j2',
          status: 'COMPLETED',
          durationMs: 20,
          exitCode: 0,
          errorMessage: null,
          completedAt: new Date(),
          agentId: 'ag1',
        },
      ]),
    };
    const res = await svc.toolDetail(userId, { engagementId: 'e1' }, 'nmap', 50);
    expect(res.runs).toHaveLength(2);
    expect(res.runs[0]).toMatchObject({ scanJobId: 'j1', status: 'FAILED' });
    expect(res.recurringErrors).toEqual([{ message: 'boom', count: 1 }]);
    expect(res.agents.find((a) => a.agentId === 'ag1')).toMatchObject({
      executions: 2,
      successCount: 1,
    });
  });
});
