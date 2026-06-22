import { getCoverageSummary } from '../get-coverage-summary';

describe('getCoverageSummary', () => {
  it('computes coverage percent', async () => {
    const prisma = {
      asset: { count: jest.fn().mockResolvedValue(4) },
      assetObservation: {
        groupBy: jest.fn().mockResolvedValue([{ assetId: 'a1' }, { assetId: 'a2' }]),
      },
    } as any;
    expect(await getCoverageSummary(prisma, 'u1', 'e1')).toEqual({
      totalAssets: 4,
      scannedAssets: 2,
      percent: 50,
    });
  });

  it('returns 0 percent when no assets', async () => {
    const prisma = {
      asset: { count: jest.fn().mockResolvedValue(0) },
      assetObservation: { groupBy: jest.fn().mockResolvedValue([]) },
    } as any;
    expect(await getCoverageSummary(prisma, 'u1')).toEqual({
      totalAssets: 0,
      scannedAssets: 0,
      percent: 0,
    });
  });
});
