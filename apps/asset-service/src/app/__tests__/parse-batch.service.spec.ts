/**
 * ParseBatchService — SP2b scope.
 *
 * The asset graph is still written in one transaction, but `Asset.riskScore` is no longer part
 * of it: risk-engine owns that column. This suite pins the new contract — after the batch
 * commits, the touched assets are handed to risk-engine best-effort, and a risk outage never
 * fails a batch that already persisted.
 */
jest.mock('@autoscanner/correlation', () => ({
  writeObservation: jest.fn().mockResolvedValue(undefined),
}));

import { ParseBatchService } from '../parse-batch.service';

function makeHarness() {
  const tx = {};
  const prisma = {
    $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  };
  const assetPersister = { upsert: jest.fn() };
  const portPersister = { upsert: jest.fn() };
  const servicePersister = { upsert: jest.fn() };
  const technologyPersister = { upsert: jest.fn() };
  const riskClient = { recomputeBatch: jest.fn().mockResolvedValue({ recomputed: 0 }) };

  const svc = new ParseBatchService(
    prisma as never,
    assetPersister as never,
    portPersister as never,
    servicePersister as never,
    technologyPersister as never,
    riskClient as never,
  );
  return { svc, prisma, assetPersister, riskClient };
}

const reqWith = (assets: Array<{ type: string; value: string }>) => ({
  engagementId: 'eng_1',
  scanJobId: 'job_1',
  scannerName: 'nmap',
  assets,
  ports: [],
  services: [],
  technologies: [],
});

describe('ParseBatchService risk delegation (SP2b)', () => {
  it('asks risk-engine to recompute the touched assets after the batch commits', async () => {
    const { svc, assetPersister, riskClient } = makeHarness();
    assetPersister.upsert.mockResolvedValueOnce('asset_a').mockResolvedValueOnce('asset_b');

    await svc.persist(
      reqWith([
        { type: 'IP', value: '10.0.0.5' },
        { type: 'DOMAIN', value: 'a.example.com' },
      ]) as never,
    );

    expect(riskClient.recomputeBatch).toHaveBeenCalledTimes(1);
    expect(riskClient.recomputeBatch.mock.calls[0][0].sort()).toEqual(['asset_a', 'asset_b']);
  });

  it('does not call risk-engine when no asset was touched', async () => {
    const { svc, riskClient } = makeHarness();

    await svc.persist(reqWith([]) as never);

    expect(riskClient.recomputeBatch).not.toHaveBeenCalled();
  });

  it('still resolves the batch when the risk recompute fails (best-effort)', async () => {
    const { svc, assetPersister, riskClient } = makeHarness();
    assetPersister.upsert.mockResolvedValueOnce('asset_a');
    riskClient.recomputeBatch.mockRejectedValue(new Error('risk-engine down'));

    const res = await svc.persist(reqWith([{ type: 'IP', value: '10.0.0.5' }]) as never);

    expect(res.assetsPersisted).toBe(1);
    expect(res).not.toHaveProperty('touchedAssetIds');
  });
});
