import type { PrismaService } from '@autoscanner/database';

import { DedupFindingsService } from '../dedup-findings.service';

// NOTE: the mergeSubdomains/mergeIpAddresses suites moved to discovery-service with the
// code itself (SP1a) — see apps/discovery-service/src/app/__tests__/merge.service.spec.ts.

describe('DedupFindingsService.dedupFindings()', () => {
  type Prisma = {
    $queryRaw: jest.Mock;
    finding: { deleteMany: jest.Mock };
  };

  let prisma: Prisma;
  let service: DedupFindingsService;

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn(),
      finding: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    service = new DedupFindingsService(prisma as unknown as PrismaService);
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
