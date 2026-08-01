import { FindingBatchService } from '../finding-batch.service';

function makeHarness() {
  const tx = {
    assetObservation: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  };
  const findings = { upsert: jest.fn().mockResolvedValue(undefined) };
  const bus = { publish: jest.fn().mockResolvedValue(undefined) };
  const svc = new FindingBatchService(prisma as never, findings as never, bus as never);
  return { svc, prisma, findings, bus, tx };
}

const req = {
  engagementId: 'eng_1',
  scanJobId: 'job_1',
  scannerName: 'nuclei',
  findings: [
    {
      assetId: 'asset_a',
      assetCanonical: 'a.example.com',
      scannerName: 'nuclei',
      title: 'Log4Shell',
      severity: 'CRITICAL',
      location: 'https://a.example.com/api',
      cveId: 'CVE-2021-44228',
    },
    {
      assetId: 'asset_a',
      assetCanonical: 'a.example.com',
      scannerName: 'nuclei',
      title: 'Exposed .git',
      severity: 'HIGH',
    },
    {
      assetId: 'asset_b',
      assetCanonical: 'b.example.com',
      scannerName: 'nuclei',
      title: 'Weak TLS',
      severity: 'MEDIUM',
    },
  ],
};

describe('FindingBatchService.persist', () => {
  it('persists every finding inside ONE transaction', async () => {
    const { svc, prisma, findings } = makeHarness();

    const res = await svc.persist(req as never);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(findings.upsert).toHaveBeenCalledTimes(3);
    expect(res.findingsPersisted).toBe(3);
  });

  it('passes the scanJob, assetId and canonical value the dedup hash depends on', async () => {
    const { svc, findings } = makeHarness();

    await svc.persist(req as never);

    const [scanJobId, assetId, finding, assetCanonical] = findings.upsert.mock.calls[0];
    expect(scanJobId).toBe('job_1');
    expect(assetId).toBe('asset_a');
    expect(assetCanonical).toBe('a.example.com');
    expect(finding).toMatchObject({ title: 'Log4Shell', cveId: 'CVE-2021-44228' });
  });

  it('de-duplicates affectedAssetIds so risk is recomputed once per asset', async () => {
    const { svc } = makeHarness();

    const res = await svc.persist(req as never);

    expect(res.affectedAssetIds.sort()).toEqual(['asset_a', 'asset_b']);
  });

  it('returns FINDING_RAISED observations instead of writing AssetObservation itself', async () => {
    const { svc, tx } = makeHarness();

    const res = await svc.persist(req as never);

    // AssetObservation belongs to asset-service — this service must never write it.
    expect(tx.assetObservation.create).not.toHaveBeenCalled();
    expect(res.observations).toHaveLength(3);
    expect(res.observations[0]).toMatchObject({
      assetId: 'asset_a',
      kind: 'FINDING_RAISED',
      payload: expect.objectContaining({ title: 'Log4Shell', severity: 'CRITICAL' }),
    });
  });

  it('publishes security.finding.created only after the transaction commits', async () => {
    const { svc, bus, prisma } = makeHarness();
    const order: string[] = [];
    prisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => {
      const out = await fn({ assetObservation: { create: jest.fn() } });
      order.push('commit');
      return out;
    });
    bus.publish.mockImplementation(async () => {
      order.push('publish');
    });

    await svc.persist(req as never);

    expect(order[0]).toBe('commit');
    expect(bus.publish).toHaveBeenCalledTimes(3);
    expect(bus.publish.mock.calls[0][0]).toBe('security.finding.created');
  });

  it('never fails the batch when publishing an event throws', async () => {
    const { svc, bus } = makeHarness();
    bus.publish.mockRejectedValue(new Error('bus down'));

    await expect(svc.persist(req as never)).resolves.toMatchObject({ findingsPersisted: 3 });
  });

  it('propagates a persister failure so the transaction rolls back', async () => {
    const { svc, findings } = makeHarness();
    findings.upsert.mockRejectedValueOnce(new Error('db boom'));

    await expect(svc.persist(req as never)).rejects.toThrow('db boom');
  });
});
