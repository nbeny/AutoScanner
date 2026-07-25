import { ScansService } from '../scans.service';

describe('ScansService.listAllForOwner — statusIn filter', () => {
  function makeSvc() {
    const prisma = { scan: { findMany: jest.fn().mockResolvedValue([]) } } as any;
    // listAllForOwner only touches this.prisma; the other constructor deps are
    // irrelevant here, so pass undefined.
    const svc = new (ScansService as any)(
      prisma,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );
    return { svc, prisma };
  }

  it('filters status with { in } when statusIn is provided', async () => {
    const { svc, prisma } = makeSvc();
    await svc.listAllForOwner('u1', { statusIn: ['RUNNING', 'QUEUED'] });
    expect(prisma.scan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { in: ['RUNNING', 'QUEUED'] } }),
      }),
    );
  });

  it('falls back to the single status filter when statusIn is absent', async () => {
    const { svc, prisma } = makeSvc();
    await svc.listAllForOwner('u1', { status: 'FAILED' });
    expect(prisma.scan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });
});
