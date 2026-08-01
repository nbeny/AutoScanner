/**
 * SP2c: correlateFindings can scope to a subset of assets. Clustering is per-asset, so
 * re-clustering only the touched assets is complete — this pins the query filter it builds.
 */
import { CorrelationService } from '../correlation.service';

function harness(rows: unknown[] = []) {
  const findMany = jest.fn().mockResolvedValue(rows);
  const prisma = { finding: { findMany }, $transaction: jest.fn() };
  return { svc: new CorrelationService(prisma as never), findMany };
}

describe('correlateFindings scoping', () => {
  it('stays engagement-wide when no assetIds are given', async () => {
    const { svc, findMany } = harness();
    await svc.correlateFindings('eng_1');
    expect(findMany.mock.calls[0][0].where).toEqual({ asset: { engagementId: 'eng_1' } });
  });

  it('restricts to the given assetIds when provided', async () => {
    const { svc, findMany } = harness();
    await svc.correlateFindings('eng_1', ['a1', 'a2']);
    expect(findMany.mock.calls[0][0].where).toEqual({
      asset: { engagementId: 'eng_1', id: { in: ['a1', 'a2'] } },
    });
  });

  it('short-circuits without querying when an empty assetIds array is given', async () => {
    const { svc, findMany } = harness();
    const res = await svc.correlateFindings('eng_1', []);
    expect(res).toEqual({ clusters: 0 });
    expect(findMany).not.toHaveBeenCalled();
  });
});
