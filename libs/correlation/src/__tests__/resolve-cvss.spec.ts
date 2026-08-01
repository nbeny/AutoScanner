import { resolveCvssScores } from '../resolve-cvss';

function makePrisma(
  nvd: Array<{ cveId: string; cvssV3Score: number | null }>,
  cache: Array<{ cveId: string; cvssV3Score: number | null }>,
) {
  return {
    nvdCve: { findMany: jest.fn().mockResolvedValue(nvd) },
    cveCache: { findMany: jest.fn().mockResolvedValue(cache) },
  };
}

describe('resolveCvssScores', () => {
  it('returns an empty map for no cveIds and queries nothing', async () => {
    const prisma = makePrisma([], []);
    const map = await resolveCvssScores(prisma as never, []);
    expect(map.size).toBe(0);
    expect(prisma.nvdCve.findMany).not.toHaveBeenCalled();
    expect(prisma.cveCache.findMany).not.toHaveBeenCalled();
  });

  it('prefers NvdCve over CveCache for the same CVE', async () => {
    const prisma = makePrisma(
      [{ cveId: 'CVE-1', cvssV3Score: 9.8 }],
      [{ cveId: 'CVE-1', cvssV3Score: 5.0 }],
    );
    const map = await resolveCvssScores(prisma as never, ['CVE-1']);
    expect(map.get('CVE-1')).toBe(9.8);
    // NvdCve answered, so CveCache is not even queried for it.
    expect(prisma.cveCache.findMany).not.toHaveBeenCalled();
  });

  it('falls back to CveCache when NvdCve has no row or a null score', async () => {
    const prisma = makePrisma(
      [{ cveId: 'CVE-2', cvssV3Score: null }],
      [{ cveId: 'CVE-2', cvssV3Score: 7.5 }],
    );
    const map = await resolveCvssScores(prisma as never, ['CVE-1', 'CVE-2']);
    expect(map.get('CVE-2')).toBe(7.5);
    // Only the CVEs NvdCve didn't score are looked up in the cache.
    expect(prisma.cveCache.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { cveId: { in: ['CVE-1', 'CVE-2'] } } }),
    );
  });

  it('de-duplicates the input before querying', async () => {
    const prisma = makePrisma([{ cveId: 'CVE-1', cvssV3Score: 9.8 }], []);
    await resolveCvssScores(prisma as never, ['CVE-1', 'CVE-1']);
    expect(prisma.nvdCve.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { cveId: { in: ['CVE-1'] } } }),
    );
  });
});
