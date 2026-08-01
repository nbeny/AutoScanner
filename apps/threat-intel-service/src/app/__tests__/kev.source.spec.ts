import { KevSource } from '../sources/kev.source';

describe('KevSource', () => {
  it('returns no signal when the finding has no cveId', async () => {
    const fetcher = jest.fn().mockResolvedValue(new Set(['CVE-2021-44228']));
    const src = new KevSource(fetcher);

    const signals = await src.lookup({ cveId: null });

    expect(signals).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('flags a CVE on the KEV catalog as ACTIVE_EXPLOITATION / CRITICAL', async () => {
    const src = new KevSource(async () => new Set(['CVE-2021-44228']));

    const signals = await src.lookup({ cveId: 'CVE-2021-44228' });

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      indicator: 'CVE-2021-44228',
      kind: 'ACTIVE_EXPLOITATION',
      source: 'cisa-kev',
      severity: 'CRITICAL',
    });
  });

  it('returns nothing for a CVE not on the catalog', async () => {
    const src = new KevSource(async () => new Set(['CVE-2021-44228']));

    expect(await src.lookup({ cveId: 'CVE-2000-0001' })).toEqual([]);
  });

  it('caches the catalog across lookups (fetched once)', async () => {
    const fetcher = jest.fn().mockResolvedValue(new Set(['CVE-1']));
    const src = new KevSource(fetcher);

    await src.lookup({ cveId: 'CVE-1' });
    await src.lookup({ cveId: 'CVE-1' });

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('degrades to no signal when the catalog fetch throws', async () => {
    const src = new KevSource(async () => {
      throw new Error('network down');
    });

    expect(await src.lookup({ cveId: 'CVE-1' })).toEqual([]);
  });
});
