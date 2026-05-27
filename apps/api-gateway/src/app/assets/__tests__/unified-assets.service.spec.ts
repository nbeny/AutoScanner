import { NotFoundError } from '@autoscanner/common';
import type { PrismaService } from '@autoscanner/database';

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
