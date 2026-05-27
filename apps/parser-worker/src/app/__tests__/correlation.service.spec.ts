import type { PrismaService } from '@autoscanner/database';

import { CorrelationService, canonicalize } from '../correlation.service';

describe('canonicalize()', () => {
  describe('DOMAIN / SUBDOMAIN', () => {
    it('lowercases', () => {
      expect(canonicalize('API.Client.COM', { type: 'DOMAIN' })).toBe('api.client.com');
      expect(canonicalize('API.Client.COM', { type: 'SUBDOMAIN' })).toBe('api.client.com');
    });

    it('trims whitespace', () => {
      expect(canonicalize('  api.client.com  ', { type: 'SUBDOMAIN' })).toBe('api.client.com');
    });

    it('strips trailing dot (FQDN root)', () => {
      expect(canonicalize('api.client.com.', { type: 'SUBDOMAIN' })).toBe('api.client.com');
      expect(canonicalize('client.com.', { type: 'DOMAIN' })).toBe('client.com');
    });

    it('combines lowercase + trim + trailing-dot strip', () => {
      expect(canonicalize(' API.Client.COM. ', { type: 'SUBDOMAIN' })).toBe('api.client.com');
    });

    it('is idempotent', () => {
      const inputs = ['API.Client.com.', '  Foo.bar.  ', 'host.example.org'];
      for (const v of inputs) {
        const once = canonicalize(v, { type: 'SUBDOMAIN' });
        const twice = canonicalize(once, { type: 'SUBDOMAIN' });
        expect(twice).toBe(once);
      }
    });
  });

  describe('IP_ADDRESS', () => {
    it('passes IPv4 through unchanged (already canonical)', () => {
      expect(canonicalize('10.0.0.5', { type: 'IP_ADDRESS' })).toBe('10.0.0.5');
      expect(canonicalize('192.168.1.1', { type: 'IP_ADDRESS' })).toBe('192.168.1.1');
    });

    it('lowercases IPv6 (does not compress yet — deferred to Phase 4)', () => {
      // Phase 2: just lowercase + trim. Full IPv6 compression is deferred.
      expect(canonicalize('2001:DB8::1', { type: 'IP_ADDRESS' })).toBe('2001:db8::1');
    });

    it('trims whitespace', () => {
      expect(canonicalize('  10.0.0.5  ', { type: 'IP_ADDRESS' })).toBe('10.0.0.5');
    });

    it('is idempotent', () => {
      const inputs = ['10.0.0.5', '2001:DB8::1', '  192.168.1.1  '];
      for (const v of inputs) {
        const once = canonicalize(v, { type: 'IP_ADDRESS' });
        const twice = canonicalize(once, { type: 'IP_ADDRESS' });
        expect(twice).toBe(once);
      }
    });
  });
});

describe('CorrelationService.mergeSubdomains()', () => {
  type Prisma = {
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
    asset: { updateMany: jest.Mock };
    dnsRecord: { updateMany: jest.Mock };
    subdomainIp: { updateMany: jest.Mock };
    subdomain: { deleteMany: jest.Mock };
  };

  let prisma: Prisma;
  let service: CorrelationService;

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn(),
      // The pseudocode passes an array of pre-built ops to $transaction; we
      // return resolved values for each op (the real Prisma client also resolves
      // each op in order).
      $transaction: jest.fn(async (ops: unknown[]) => ops.map(() => ({ count: 0 }))),
      asset: { updateMany: jest.fn().mockReturnValue({ __op: 'asset.updateMany' }) },
      dnsRecord: { updateMany: jest.fn().mockReturnValue({ __op: 'dnsRecord.updateMany' }) },
      subdomainIp: { updateMany: jest.fn().mockReturnValue({ __op: 'subdomainIp.updateMany' }) },
      subdomain: { deleteMany: jest.fn().mockReturnValue({ __op: 'subdomain.deleteMany' }) },
    };
    service = new CorrelationService(prisma as unknown as PrismaService);
  });

  it('returns merged=0 when there are no duplicate groups', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([]);

    const result = await service.mergeSubdomains('eng_1');

    expect(result).toEqual({ merged: 0 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('queries Subdomain duplicates scoped to the engagementId', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([]);

    await service.mergeSubdomains('eng_42');

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    // We can't easily assert the literal SQL via tagged-template mock, but we
    // can assert it was called with the engagementId interpolated somewhere.
    const callArgs = prisma.$queryRaw.mock.calls[0];
    const serialized = JSON.stringify(callArgs);
    expect(serialized).toContain('eng_42');
  });

  it('merges one duplicate group: keeps first id, drops rest, returns merged=N-1', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      { canonicalValue: 'api.client.com', ids: ['s1', 's2', 's3'] },
    ]);

    const result = await service.mergeSubdomains('eng_1');

    expect(result).toEqual({ merged: 2 });

    // $transaction called once with an array of 4 ops (in this order):
    // asset.updateMany, dnsRecord.updateMany, subdomainIp.updateMany, subdomain.deleteMany
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const ops = prisma.$transaction.mock.calls[0][0] as Array<{ __op: string }>;
    expect(ops).toHaveLength(4);
    expect(ops[0].__op).toBe('asset.updateMany');
    expect(ops[1].__op).toBe('dnsRecord.updateMany');
    expect(ops[2].__op).toBe('subdomainIp.updateMany');
    expect(ops[3].__op).toBe('subdomain.deleteMany');

    // Repoint child rows from {s2,s3} → s1.
    expect(prisma.asset.updateMany).toHaveBeenCalledWith({
      where: { subdomainId: { in: ['s2', 's3'] } },
      data: { subdomainId: 's1' },
    });
    expect(prisma.dnsRecord.updateMany).toHaveBeenCalledWith({
      where: { subdomainId: { in: ['s2', 's3'] } },
      data: { subdomainId: 's1' },
    });
    expect(prisma.subdomainIp.updateMany).toHaveBeenCalledWith({
      where: { subdomainId: { in: ['s2', 's3'] } },
      data: { subdomainId: 's1' },
    });
    // Hard-delete the drop ids.
    expect(prisma.subdomain.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['s2', 's3'] } },
    });
  });

  it('returns cumulative merged count across multiple duplicate groups', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      { canonicalValue: 'a.client.com', ids: ['a1', 'a2'] },
      { canonicalValue: 'b.client.com', ids: ['b1', 'b2', 'b3', 'b4'] },
    ]);

    const result = await service.mergeSubdomains('eng_1');

    // group A: drop 1 (keep a1) + group B: drop 3 (keep b1) = 4
    expect(result).toEqual({ merged: 4 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('preserves the order of ids passed by $queryRaw (first wins)', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      { canonicalValue: 'api.client.com', ids: ['oldest', 'middle', 'newest'] },
    ]);

    await service.mergeSubdomains('eng_1');

    expect(prisma.subdomain.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['middle', 'newest'] } },
    });
    expect(prisma.asset.updateMany).toHaveBeenCalledWith({
      where: { subdomainId: { in: ['middle', 'newest'] } },
      data: { subdomainId: 'oldest' },
    });
  });

  it('isolates per-group failures: P2002 on group A does not skip group B', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      { canonicalValue: 'a.client.com', ids: ['a1', 'a2'] },
      { canonicalValue: 'b.client.com', ids: ['b1', 'b2'] },
    ]);
    // First $transaction throws P2002, second succeeds.
    const p2002 = Object.assign(new Error('Unique constraint failed on subdomainId'), {
      code: 'P2002',
    });
    prisma.$transaction.mockRejectedValueOnce(p2002).mockResolvedValueOnce([{ count: 0 }]);
    const warnSpy = jest
      .spyOn(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        require('@nestjs/common').Logger.prototype as any,
        'warn',
      )
      .mockImplementation(() => undefined);

    const result = await service.mergeSubdomains('eng_1');

    // Group B still merged → 1 row dropped.
    expect(result).toEqual({ merged: 1 });
    // $transaction called twice (one per group, no short-circuit).
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/merge group 'a\.client\.com' failed.*code=P2002/),
      expect.any(String),
    );
    warnSpy.mockRestore();
  });

  it('propagates $queryRaw errors to the caller (processor try/catch handles them)', async () => {
    prisma.$queryRaw.mockRejectedValueOnce(new Error('DB unreachable'));
    await expect(service.mergeSubdomains('eng_1')).rejects.toThrow(/DB unreachable/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('CorrelationService.dedupFindings()', () => {
  type Prisma = {
    $queryRaw: jest.Mock;
    finding: { deleteMany: jest.Mock };
  };

  let prisma: Prisma;
  let service: CorrelationService;

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn(),
      finding: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    service = new CorrelationService(prisma as unknown as PrismaService);
  });

  it('returns merged=0 when there are no cross-asset duplicate hashes', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([]);

    const result = await service.dedupFindings('eng_1');

    expect(result).toEqual({ merged: 0 });
    expect(prisma.finding.deleteMany).not.toHaveBeenCalled();
  });

  it('queries Finding cross-asset duplicates scoped to the engagementId', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([]);

    await service.dedupFindings('eng_42');

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const serialized = JSON.stringify(prisma.$queryRaw.mock.calls[0]);
    expect(serialized).toContain('eng_42');
  });

  it('keeps the first (earliest) Finding id and deletes the rest', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      { dedupHash: 'abc123', ids: ['f_oldest', 'f_middle', 'f_newest'] },
    ]);

    const result = await service.dedupFindings('eng_1');

    expect(result).toEqual({ merged: 2 });
    expect(prisma.finding.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['f_middle', 'f_newest'] } },
    });
  });

  it('returns cumulative merged across multiple groups', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      { dedupHash: 'h1', ids: ['a1', 'a2'] },
      { dedupHash: 'h2', ids: ['b1', 'b2', 'b3'] },
    ]);

    const result = await service.dedupFindings('eng_1');

    // group h1: drop 1 + group h2: drop 2 = 3
    expect(result).toEqual({ merged: 3 });
    expect(prisma.finding.deleteMany).toHaveBeenCalledTimes(2);
  });

  it('isolates per-group failures: one bad group does not abort the rest', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      { dedupHash: 'h1', ids: ['a1', 'a2'] },
      { dedupHash: 'h2', ids: ['b1', 'b2'] },
    ]);
    prisma.finding.deleteMany
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ count: 1 });
    const warnSpy = jest
      .spyOn(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        require('@nestjs/common').Logger.prototype as any,
        'warn',
      )
      .mockImplementation(() => undefined);

    const result = await service.dedupFindings('eng_1');

    expect(result).toEqual({ merged: 1 });
    expect(prisma.finding.deleteMany).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/Finding dedup group.*failed.*boom/),
      expect.any(String),
    );
    warnSpy.mockRestore();
  });

  it('propagates $queryRaw errors to the caller', async () => {
    prisma.$queryRaw.mockRejectedValueOnce(new Error('DB unreachable'));
    await expect(service.dedupFindings('eng_1')).rejects.toThrow(/DB unreachable/);
    expect(prisma.finding.deleteMany).not.toHaveBeenCalled();
  });
});
