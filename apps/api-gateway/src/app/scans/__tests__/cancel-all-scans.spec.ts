import { ScansService } from '../scans.service';

describe('ScansService.cancelAllScans', () => {
  function makeService(scanRows: Array<{ id: string }>) {
    const prisma = {
      scan: { findMany: jest.fn().mockResolvedValue(scanRows) },
    } as any;
    const svc = new ScansService(
      prisma,
      {} as any, // registry
      {} as any, // scanQueue
      {} as any, // storage
      {} as any, // scanControl
      {} as any, // events
      {} as any, // capabilities
    );
    return { svc, prisma };
  }

  it('cancels each non-terminal scan in the engagement and returns the count', async () => {
    const { svc, prisma } = makeService([{ id: 's1' }, { id: 's2' }]);
    const cancelSpy = jest.spyOn(svc, 'cancelScan').mockResolvedValue({} as any);

    const count = await svc.cancelAllScans('user-1', 'eng-1');

    expect(count).toBe(2);
    expect(cancelSpy).toHaveBeenCalledWith('user-1', 's1');
    expect(cancelSpy).toHaveBeenCalledWith('user-1', 's2');
    expect(prisma.scan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          engagementId: 'eng-1',
          status: { notIn: ['COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT'] },
        }),
      }),
    );
  });

  it('continues and counts only successful cancels when one fails', async () => {
    const { svc } = makeService([{ id: 's1' }, { id: 's2' }]);
    jest
      .spyOn(svc, 'cancelScan')
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({} as any);

    const count = await svc.cancelAllScans('user-1', 'eng-1');
    expect(count).toBe(1);
  });
});
