import { getSeverityTrend } from '../get-severity-trend';

describe('getSeverityTrend', () => {
  it('buckets findings by day and tallies severity', async () => {
    const prisma = {
      finding: {
        findMany: jest.fn().mockResolvedValue([
          { firstSeenAt: new Date('2026-01-01T08:00:00Z'), severity: 'CRITICAL' },
          { firstSeenAt: new Date('2026-01-01T20:00:00Z'), severity: 'HIGH' },
          { firstSeenAt: new Date('2026-01-02T10:00:00Z'), severity: 'CRITICAL' },
        ]),
      },
    } as any;

    const res = await getSeverityTrend(prisma, 'u1', 'e1', 30);

    expect(res).toEqual([
      { bucketDate: '2026-01-01', counts: { critical: 1, high: 1, medium: 0, low: 0, info: 0 } },
      { bucketDate: '2026-01-02', counts: { critical: 1, high: 0, medium: 0, low: 0, info: 0 } },
    ]);
  });

  it('returns empty array when no findings', async () => {
    const prisma = {
      finding: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;

    const res = await getSeverityTrend(prisma, 'u1', undefined, 7);
    expect(res).toEqual([]);
  });

  it('passes ownerId scope without engagementId', async () => {
    const prisma = {
      finding: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;

    await getSeverityTrend(prisma, 'u1', undefined, 14);

    const call = (prisma.finding.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.asset.engagement).not.toHaveProperty('id');
    expect(call.where.asset.engagement.ownerId).toBe('u1');
  });

  it('passes engagementId scope when provided', async () => {
    const prisma = {
      finding: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;

    await getSeverityTrend(prisma, 'u1', 'e1', 14);

    const call = (prisma.finding.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.asset.engagement.id).toBe('e1');
  });
});
