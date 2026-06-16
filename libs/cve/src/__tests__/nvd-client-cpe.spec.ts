import { NvdClient } from '../nvd-client';
import { TokenBucketRateLimiter } from '../rate-limiter';

function res(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => '',
    headers: { get: () => null },
  } as unknown as Response;
}
const limiter = () => new TokenBucketRateLimiter({ capacity: 100, refillIntervalMs: 1000 });
const page = (
  vulns: unknown[],
  totalResults: number,
  startIndex = 0,
  resultsPerPage = vulns.length,
) => ({
  totalResults,
  startIndex,
  resultsPerPage,
  vulnerabilities: vulns,
});
const vuln = (id: string, score: number | null) => ({
  cve: {
    id,
    published: '2024-01-01T00:00:00',
    lastModified: '2024-01-01T00:00:00',
    descriptions: [],
    metrics:
      score === null
        ? {}
        : { cvssMetricV31: [{ cvssData: { baseScore: score, vectorString: 'X' } }] },
  },
});

describe('NvdClient.findCvesByCpe', () => {
  it('returns cveId+score list for a CPE (single page)', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(res(page([vuln('CVE-2014-0160', 9.4)], 1)));
    const c = new NvdClient({ apiKey: undefined, rateLimiter: limiter(), fetchImpl });
    const out = await c.findCvesByCpe('cpe:2.3:a:openssl:openssl:1.0.1:*:*:*:*:*:*:*');
    expect(out).toEqual([{ cveId: 'CVE-2014-0160', cvssScore: 9.4 }]);
    expect(String(fetchImpl.mock.calls[0][0])).toContain('cpeName=');
  });

  it('paginates when totalResults exceeds one page', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(res(page([vuln('CVE-1', 5)], 2, 0, 1)))
      .mockResolvedValueOnce(res(page([vuln('CVE-2', null)], 2, 1, 1)));
    const c = new NvdClient({ apiKey: undefined, rateLimiter: limiter(), fetchImpl });
    const out = await c.findCvesByCpe('cpe:2.3:a:vendor:prod:1.0:*:*:*:*:*:*:*');
    expect(out.map((x) => x.cveId)).toEqual(['CVE-1', 'CVE-2']);
    expect(out[1].cvssScore).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('returns [] on empty results', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(res(page([], 0)));
    const c = new NvdClient({ apiKey: undefined, rateLimiter: limiter(), fetchImpl });
    expect(await c.findCvesByCpe('cpe:2.3:a:x:y:1:*:*:*:*:*:*:*')).toEqual([]);
  });

  it('uses virtualMatchString for a non-cpe2.3 string', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(res(page([], 0)));
    const c = new NvdClient({ apiKey: undefined, rateLimiter: limiter(), fetchImpl });
    await c.findCvesByCpe('openssl 1.0.1');
    expect(String(fetchImpl.mock.calls[0][0])).toContain('virtualMatchString=');
  });
});
