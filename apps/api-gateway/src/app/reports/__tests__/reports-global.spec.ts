import { ReportsService } from '../reports.service';

describe('ReportsService.listForOwner — scope handling', () => {
  function makeService() {
    const prisma = {
      report: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;
    // Constructor: (prisma, reportQueue, storage) — pass undefined stubs for the
    // two extra deps; listForOwner only uses this.prisma.
    const svc = new (ReportsService as any)(prisma, undefined, undefined);
    return { svc, prisma };
  }

  it('lists all of the owner reports when engagementId is null', async () => {
    const { svc, prisma } = makeService();
    await svc.listForOwner('user-1', null);
    expect(prisma.report.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { engagement: { ownerId: 'user-1', deletedAt: null } },
      }),
    );
  });

  it('scopes to the engagement when provided', async () => {
    const { svc, prisma } = makeService();
    await svc.listForOwner('user-1', 'eng-1');
    expect(prisma.report.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { engagementId: 'eng-1', engagement: { ownerId: 'user-1', deletedAt: null } },
      }),
    );
  });
});
