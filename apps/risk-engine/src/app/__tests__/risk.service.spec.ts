import { RiskService } from '../risk.service';

jest.mock('@autoscanner/correlation', () => ({
  computeAssetRiskScore: jest.fn(),
}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
import { computeAssetRiskScore } from '@autoscanner/correlation';

function makeHarness(prev: number | null, next: number) {
  (computeAssetRiskScore as jest.Mock).mockResolvedValue(next);
  const update = jest.fn().mockResolvedValue({ id: 'a1', riskScore: next });
  const prisma = {
    asset: {
      findUnique: jest.fn().mockResolvedValue({ id: 'a1', engagementId: 'e1', riskScore: prev }),
      update,
    },
  };
  const bus = { publish: jest.fn().mockResolvedValue(undefined) };
  return { svc: new RiskService(prisma as never, bus as never), prisma, update, bus };
}

describe('RiskService.recompute', () => {
  beforeEach(() => jest.clearAllMocks());

  it('writes the computed score and returns it', async () => {
    const { svc, update } = makeHarness(1, 8.5);

    const res = await svc.recompute('a1');

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'a1' }, data: { riskScore: 8.5 } }),
    );
    expect(res).toEqual({ assetId: 'a1', riskScore: 8.5 });
  });

  it('throws when the asset does not exist and never writes', async () => {
    const { svc, prisma, update } = makeHarness(1, 8.5);
    (prisma.asset.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(svc.recompute('missing')).rejects.toThrow(/Asset not found/);
    expect(update).not.toHaveBeenCalled();
  });

  it('publishes calculated but NOT changed when the score is unchanged', async () => {
    const { svc, bus } = makeHarness(8.5, 8.5);

    await svc.recompute('a1');

    const topics = bus.publish.mock.calls.map((c) => c[0]);
    expect(topics).toContain('security.risk.calculated');
    expect(topics).not.toContain('security.risk.changed');
  });

  it('publishes changed when the score moves', async () => {
    const { svc, bus } = makeHarness(1, 8.5);

    await svc.recompute('a1');

    expect(bus.publish.mock.calls.map((c) => c[0])).toContain('security.risk.changed');
  });

  it('publishes risk.alert when the new score crosses the high threshold', async () => {
    const { svc, bus } = makeHarness(1, 9);

    await svc.recompute('a1');

    expect(bus.publish.mock.calls.map((c) => c[0])).toContain('security.risk.alert');
  });

  it('does NOT alert when the changed score is below the threshold', async () => {
    const { svc, bus } = makeHarness(1, 4);

    await svc.recompute('a1');

    expect(bus.publish.mock.calls.map((c) => c[0])).not.toContain('security.risk.alert');
  });

  it('never fails the recompute when publishing throws', async () => {
    const { svc, bus } = makeHarness(1, 8.5);
    bus.publish.mockRejectedValue(new Error('bus down'));

    await expect(svc.recompute('a1')).resolves.toEqual({ assetId: 'a1', riskScore: 8.5 });
  });
});

describe('RiskService.recomputeBatch', () => {
  beforeEach(() => jest.clearAllMocks());

  it('recomputes each distinct asset and counts the successes', async () => {
    const { svc } = makeHarness(1, 8.5);

    const res = await svc.recomputeBatch(['a1', 'a1', 'a2']);

    // 'a1' de-duplicated → 2 distinct recomputes.
    expect(res).toEqual({ recomputed: 2 });
  });

  it('keeps going when one asset fails and reports only the successes', async () => {
    const { svc, prisma } = makeHarness(1, 8.5);
    (prisma.asset.findUnique as jest.Mock)
      .mockResolvedValueOnce(null) // a1 → throws inside recompute
      .mockResolvedValue({ id: 'a2', engagementId: 'e1', riskScore: 1 });

    const res = await svc.recomputeBatch(['a1', 'a2']);

    expect(res).toEqual({ recomputed: 1 });
  });
});
