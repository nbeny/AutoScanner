/**
 * Ported from libs/correlation's AssetMergeService suite when the Subdomain/IpAddress merge
 * moved into discovery-service (SP1a). The behaviour under test is unchanged: pick the
 * earliest row as the winner, repoint every child FK to it, delete the losers — all in one
 * transaction — and never let one bad group abort the rest of the pass.
 */
import { MergeService } from '../merge.service';

function makePrisma(groups: Array<{ canonicalValue: string; ids: string[] }>) {
  const tx = jest.fn().mockResolvedValue([]);
  return {
    $queryRaw: jest.fn().mockResolvedValue(groups),
    $transaction: tx,
    asset: { updateMany: jest.fn().mockReturnValue({ op: 'asset' }) },
    dnsRecord: { updateMany: jest.fn().mockReturnValue({ op: 'dnsRecord' }) },
    subdomainIp: { updateMany: jest.fn().mockReturnValue({ op: 'subdomainIp' }) },
    subdomain: { deleteMany: jest.fn().mockReturnValue({ op: 'subdomain.delete' }) },
    ipAddress: { deleteMany: jest.fn().mockReturnValue({ op: 'ipAddress.delete' }) },
  };
}

describe('MergeService.mergeSubdomains', () => {
  it('returns 0 and touches nothing when there are no duplicates', async () => {
    const prisma = makePrisma([]);
    const svc = new MergeService(prisma as never);

    await expect(svc.mergeSubdomains('eng_1')).resolves.toEqual({ merged: 0 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('repoints every child FK to the winner and deletes the losers in one transaction', async () => {
    const prisma = makePrisma([
      { canonicalValue: 'a.example.com', ids: ['keep', 'drop1', 'drop2'] },
    ]);
    const svc = new MergeService(prisma as never);

    const res = await svc.mergeSubdomains('eng_1');

    expect(res).toEqual({ merged: 2 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // Asset pivot, DnsRecord and SubdomainIp all move before the delete — the ordering is
    // what keeps an Asset from ever referencing a deleted Subdomain.
    expect(prisma.asset.updateMany).toHaveBeenCalledWith({
      where: { subdomainId: { in: ['drop1', 'drop2'] } },
      data: { subdomainId: 'keep' },
    });
    expect(prisma.dnsRecord.updateMany).toHaveBeenCalled();
    expect(prisma.subdomainIp.updateMany).toHaveBeenCalled();
    expect(prisma.subdomain.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['drop1', 'drop2'] } },
    });
    const ops = prisma.$transaction.mock.calls[0][0] as Array<{ op: string }>;
    expect(ops.map((o) => o.op)).toEqual(['asset', 'dnsRecord', 'subdomainIp', 'subdomain.delete']);
  });

  it('skips a group that is already merged (no losers)', async () => {
    const prisma = makePrisma([{ canonicalValue: 'solo.example.com', ids: ['only'] }]);
    const svc = new MergeService(prisma as never);

    await expect(svc.mergeSubdomains('eng_1')).resolves.toEqual({ merged: 0 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('isolates a failing group so the rest of the pass still merges', async () => {
    const prisma = makePrisma([
      { canonicalValue: 'bad.example.com', ids: ['k1', 'd1'] },
      { canonicalValue: 'good.example.com', ids: ['k2', 'd2'] },
    ]);
    prisma.$transaction
      .mockRejectedValueOnce(Object.assign(new Error('unique violation'), { code: 'P2002' }))
      .mockResolvedValueOnce([]);
    const svc = new MergeService(prisma as never);

    // The P2002 group is dropped, the healthy one still counts.
    await expect(svc.mergeSubdomains('eng_1')).resolves.toEqual({ merged: 1 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });
});

describe('MergeService.mergeIpAddresses', () => {
  it('repoints Asset + SubdomainIp then deletes the losing IpAddress rows', async () => {
    const prisma = makePrisma([{ canonicalValue: '10.0.0.5', ids: ['keep', 'drop'] }]);
    const svc = new MergeService(prisma as never);

    const res = await svc.mergeIpAddresses('eng_1');

    expect(res).toEqual({ merged: 1 });
    expect(prisma.asset.updateMany).toHaveBeenCalledWith({
      where: { ipAddressId: { in: ['drop'] } },
      data: { ipAddressId: 'keep' },
    });
    expect(prisma.ipAddress.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['drop'] } } });
    const ops = prisma.$transaction.mock.calls[0][0] as Array<{ op: string }>;
    expect(ops.map((o) => o.op)).toEqual(['asset', 'subdomainIp', 'ipAddress.delete']);
  });

  it('returns 0 when there are no duplicates', async () => {
    const prisma = makePrisma([]);
    const svc = new MergeService(prisma as never);
    await expect(svc.mergeIpAddresses('eng_1')).resolves.toEqual({ merged: 0 });
  });
});
