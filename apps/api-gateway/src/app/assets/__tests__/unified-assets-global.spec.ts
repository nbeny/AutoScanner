import { UnifiedAssetsService } from '../unified-assets.service';

describe('UnifiedAssetsService.facets — scope handling', () => {
  function makeService() {
    const prisma = {
      engagement: { findFirst: jest.fn().mockResolvedValue({ id: 'eng-1' }) },
      asset: { groupBy: jest.fn().mockResolvedValue([]) },
      finding: { groupBy: jest.fn().mockResolvedValue([]) },
      technology: { groupBy: jest.fn().mockResolvedValue([]) },
      scanJob: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;
    const svc = new UnifiedAssetsService(prisma);
    return { svc, prisma };
  }

  it('scopes facets to the owner (no engagement lookup) when engagementId is null', async () => {
    const { svc, prisma } = makeService();
    await svc.facets('user-1', null, null);
    expect(prisma.engagement.findFirst).not.toHaveBeenCalled();
    expect(prisma.asset.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { engagement: { ownerId: 'user-1', deletedAt: null }, deletedAt: null },
      }),
    );
  });

  it('verifies engagement ownership and scopes to it when engagementId is provided', async () => {
    const { svc, prisma } = makeService();
    await svc.facets('user-1', 'eng-1', null);
    expect(prisma.engagement.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'eng-1', ownerId: 'user-1', deletedAt: null } }),
    );
    expect(prisma.asset.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { engagementId: 'eng-1', deletedAt: null } }),
    );
  });

  it('does not look up an engagement for a global list', async () => {
    const { svc, prisma } = makeService();
    (prisma as any).$queryRaw = jest.fn().mockResolvedValue([]);
    await svc.list('user-1', null, {});
    expect(prisma.engagement.findFirst).not.toHaveBeenCalled();
    expect((prisma as any).$queryRaw).toHaveBeenCalled();
  });
});
