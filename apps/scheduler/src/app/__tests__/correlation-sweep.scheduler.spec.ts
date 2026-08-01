import { CorrelationSweepScheduler } from '../correlation-sweep.scheduler';

function harness(engagements: Array<{ id: string }>) {
  const prisma = {
    engagement: { findMany: jest.fn().mockResolvedValue(engagements) },
    finding: { findMany: jest.fn().mockResolvedValue([{ assetId: 'a1' }]) },
  };
  const findingClient = {
    dedup: jest.fn().mockResolvedValue({ merged: 0 }),
    correlate: jest.fn().mockResolvedValue({ clusters: 0 }),
  };
  const riskClient = { recomputeBatch: jest.fn().mockResolvedValue({ recomputed: 1 }) };
  const svc = new CorrelationSweepScheduler(
    prisma as never,
    findingClient as never,
    riskClient as never,
  );
  return { svc, prisma, findingClient, riskClient };
}

describe('CorrelationSweepScheduler.sweepOnce', () => {
  it('dedups, correlates engagement-wide and recomputes each active engagement', async () => {
    const { svc, findingClient, riskClient } = harness([{ id: 'e1' }, { id: 'e2' }]);

    await svc.sweepOnce();

    expect(findingClient.dedup).toHaveBeenCalledTimes(2);
    // Engagement-wide correlate: no assetIds argument.
    expect(findingClient.correlate).toHaveBeenCalledWith('e1');
    expect(findingClient.correlate).toHaveBeenCalledWith('e2');
    expect(riskClient.recomputeBatch).toHaveBeenCalledWith(['a1']);
  });

  it('keeps going when one engagement throws', async () => {
    const { svc, findingClient } = harness([{ id: 'e1' }, { id: 'e2' }]);
    findingClient.dedup.mockRejectedValueOnce(new Error('boom'));

    await expect(svc.sweepOnce()).resolves.toBeUndefined();
    // e2 still processed after e1 failed.
    expect(findingClient.correlate).toHaveBeenCalledWith('e2');
  });

  it('does nothing when there are no live engagements', async () => {
    const { svc, prisma, findingClient } = harness([]);
    (prisma.engagement.findMany as jest.Mock).mockResolvedValue([]);

    await svc.sweepOnce();

    expect(findingClient.dedup).not.toHaveBeenCalled();
  });

  it('skips the risk recompute when an engagement has no findings', async () => {
    const { svc, prisma, riskClient } = harness([{ id: 'e1' }]);
    (prisma.finding.findMany as jest.Mock).mockResolvedValue([]);

    await svc.sweepOnce();

    expect(riskClient.recomputeBatch).not.toHaveBeenCalled();
  });
});
