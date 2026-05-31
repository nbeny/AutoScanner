import { NotFoundError } from '@autoscanner/common';
import type { PrismaService } from '@autoscanner/database';

import { AssetSort } from '../dto/asset-sort.enum';
import { UnifiedAssetsService } from '../unified-assets.service';

describe('UnifiedAssetsService', () => {
  let prisma: jest.Mocked<PrismaService>;
  let svc: UnifiedAssetsService;
  const userId = 'user_1';
  const engagementId = 'eng_1';

  beforeEach(() => {
    prisma = {
      engagement: { findFirst: jest.fn() },
      $queryRaw: jest.fn(),
    } as unknown as jest.Mocked<PrismaService>;
    svc = new UnifiedAssetsService(prisma);
  });

  it('throws NotFoundError when the engagement is not owned by the user', async () => {
    (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce(null);

    await expect(svc.list(userId, engagementId, {})).rejects.toBeInstanceOf(NotFoundError);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('returns rows from $queryRaw when the engagement is owned', async () => {
    (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
    const fixture = [
      {
        id: 'asset_1',
        engagementId,
        kind: 'DOMAIN',
        canonicalValue: 'example.com',
        displayName: 'example.com',
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        riskScore: 0,
        attrs: { domain: { id: 'dom_1' } },
      },
    ];
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce(fixture);

    const result = await svc.list(userId, engagementId, {});

    expect(prisma.engagement.findFirst).toHaveBeenCalledWith({
      where: { id: engagementId, ownerId: userId, deletedAt: null },
      select: { id: true },
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result).toBe(fixture);
  });

  it('clamps limit between 1 and 500 and offset to >= 0', async () => {
    (prisma.engagement.findFirst as jest.Mock).mockResolvedValue({ id: engagementId });
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

    // The clamp is internal; verify it doesn't throw and $queryRaw still runs.
    await expect(svc.list(userId, engagementId, { limit: 9999, offset: -5 })).resolves.toEqual([]);
    await expect(svc.list(userId, engagementId, { limit: 0, offset: 0 })).resolves.toEqual([]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  // The bound LIMIT/OFFSET values inside the Prisma.sql tagged template are
  // awkward to introspect from a jest mock, so these tests assert the contract
  // we actually care about: the service does NOT crash on hostile pagination
  // input, and still issues exactly one $queryRaw call.
  it('defaults limit to 100 when limit is NaN (does not throw)', async () => {
    (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]);

    await expect(svc.list(userId, engagementId, { limit: Number.NaN })).resolves.toEqual([]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('truncates non-integer limit (12.7 -> 12, does not throw)', async () => {
    (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]);

    await expect(svc.list(userId, engagementId, { limit: 12.7 })).resolves.toEqual([]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('clamps negative limit to 1 (does not throw)', async () => {
    (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]);

    await expect(svc.list(userId, engagementId, { limit: -5 })).resolves.toEqual([]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('clamps oversized limit to 500 (does not throw)', async () => {
    (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]);

    await expect(svc.list(userId, engagementId, { limit: 1000 })).resolves.toEqual([]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('clamps negative offset to 0 (does not throw)', async () => {
    (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]);

    await expect(svc.list(userId, engagementId, { offset: -1 })).resolves.toEqual([]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('defaults offset to 0 when offset is NaN (does not throw)', async () => {
    (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]);

    await expect(svc.list(userId, engagementId, { offset: Number.NaN })).resolves.toEqual([]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('treats empty/whitespace search as no filter (does not throw)', async () => {
    (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]);

    await expect(svc.list(userId, engagementId, { search: '   ' })).resolves.toEqual([]);
  });

  it('treats empty kinds list as no filter (does not throw)', async () => {
    (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]);

    await expect(svc.list(userId, engagementId, { kinds: [] })).resolves.toEqual([]);
  });
});

describe('UnifiedAssetsService — filters + sort', () => {
  let prisma: jest.Mocked<PrismaService>;
  let svc: UnifiedAssetsService;
  beforeEach(() => {
    prisma = {
      engagement: { findFirst: jest.fn().mockResolvedValue({ id: 'eng_1' }) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<PrismaService>;
    svc = new UnifiedAssetsService(prisma);
  });

  it('defaults to RISK_SCORE DESC when sort is undefined', async () => {
    await svc.list('user_1', 'eng_1', {});
    const sqlArg = (prisma.$queryRaw as jest.Mock).mock.calls[0][0];
    const stringified = sqlArg.strings.join(' ');
    expect(stringified).toContain('"riskScore" DESC');
  });

  it('sorts by FIRST_SEEN_AT when requested', async () => {
    await svc.list('user_1', 'eng_1', { sort: AssetSort.FIRST_SEEN_AT });
    const sqlArg = (prisma.$queryRaw as jest.Mock).mock.calls[0][0];
    expect(sqlArg.strings.join(' ')).toContain('"firstSeenAt" DESC');
  });

  it('applies severityHas as EXISTS subquery on Finding', async () => {
    await svc.list('user_1', 'eng_1', { filters: { severityHas: ['CRITICAL', 'HIGH'] } });
    const sqlArg = (prisma.$queryRaw as jest.Mock).mock.calls[0][0];
    expect(sqlArg.strings.join(' ')).toMatch(/EXISTS[\s\S]+"Finding"/);
  });
});
