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
const cveEntry = {
  cve: {
    id: 'CVE-2024-1',
    published: '2024-01-01T00:00:00',
    lastModified: '2024-02-01T00:00:00',
    descriptions: [{ lang: 'en', value: 'desc' }],
    metrics: { cvssMetricV31: [{ cvssData: { baseScore: 7.5, vectorString: 'AV:N' } }] },
    configurations: [
      {
        nodes: [
          {
            operator: 'OR',
            cpeMatch: [
              {
                vulnerable: true,
                criteria: 'cpe:2.3:a:vendor:prod:*:*:*:*:*:*:*:*',
                versionStartIncluding: '1.0',
                versionEndExcluding: '2.0',
              },
            ],
          },
        ],
      },
    ],
  },
};

describe('NvdClient.fetchCvePage', () => {
  it('parses a page incl. configurations into NvdFullCve[]', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        res({ totalResults: 1, resultsPerPage: 2000, startIndex: 0, vulnerabilities: [cveEntry] }),
      );
    const c = new NvdClient({ apiKey: undefined, rateLimiter: limiter(), fetchImpl });
    const out = await c.fetchCvePage({ startIndex: 0, resultsPerPage: 2000 });
    expect(out.totalResults).toBe(1);
    expect(out.cves[0].cveId).toBe('CVE-2024-1');
    expect(out.cves[0].cvssV3Score).toBe(7.5);
    expect(out.cves[0].cvssV3Vector).toBe('AV:N');
    expect(out.cves[0].summary).toBe('desc');
    expect(out.cves[0].nodes).toHaveLength(1);
    expect(out.cves[0].nodes[0].operator).toBe('OR');
    expect(out.cves[0].nodes[0].negate).toBe(false);
    expect(out.cves[0].nodes[0].cpeMatch[0]).toMatchObject({
      vulnerable: true,
      criteria: 'cpe:2.3:a:vendor:prod:*:*:*:*:*:*:*:*',
      versionStartIncluding: '1.0',
      versionEndExcluding: '2.0',
    });
  });

  it('includes lastMod window params in the URL when given', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        res({ totalResults: 0, resultsPerPage: 2000, startIndex: 0, vulnerabilities: [] }),
      );
    const c = new NvdClient({ apiKey: undefined, rateLimiter: limiter(), fetchImpl });
    await c.fetchCvePage({
      startIndex: 0,
      resultsPerPage: 2000,
      lastModStartDate: '2024-01-01T00:00:00.000Z',
      lastModEndDate: '2024-02-01T00:00:00.000Z',
    });
    const url = String(fetchImpl.mock.calls[0][0]);
    expect(url).toContain('lastModStartDate=');
    expect(url).toContain('lastModEndDate=');
    expect(url).toContain('startIndex=0');
  });

  it('tolerates a CVE with no configurations (nodes=[])', async () => {
    const noConf = { cve: { ...cveEntry.cve, configurations: undefined } };
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        res({ totalResults: 1, resultsPerPage: 2000, startIndex: 0, vulnerabilities: [noConf] }),
      );
    const c = new NvdClient({ apiKey: undefined, rateLimiter: limiter(), fetchImpl });
    const out = await c.fetchCvePage({ startIndex: 0, resultsPerPage: 2000 });
    expect(out.cves[0].nodes).toEqual([]);
  });
});
