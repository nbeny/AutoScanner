import { NvdClient, NvdNotFoundError, NvdRateLimitedError, parseRetryAfter } from '../nvd-client';
import { TokenBucketRateLimiter } from '../rate-limiter';

function rateLimited429(retryAfterHeader: string | null) {
  return {
    ok: false,
    status: 429,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'retry-after' ? retryAfterHeader : null),
    },
    text: async () => 'rate limited',
  };
}

function makeClient(fetchImpl: jest.Mock) {
  return new NvdClient({
    apiKey: undefined,
    rateLimiter: new TokenBucketRateLimiter({ capacity: 5, refillIntervalMs: 30_000 }),
    fetchImpl: fetchImpl as unknown as typeof fetch,
    backoffBaseMs: 1,
    maxRetries: 3,
  });
}

describe('NvdClient', () => {
  it('parses a 200 OK NVD response', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        vulnerabilities: [
          {
            cve: {
              id: 'CVE-2024-12345',
              published: '2024-01-01T00:00:00.000',
              lastModified: '2024-02-01T00:00:00.000',
              descriptions: [{ lang: 'en', value: 'Test summary.' }],
              metrics: {
                cvssMetricV31: [
                  {
                    cvssData: {
                      baseScore: 7.5,
                      vectorString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N',
                    },
                  },
                ],
              },
            },
          },
        ],
      }),
    });

    const client = makeClient(fetchImpl);
    const result = await client.fetchCve('CVE-2024-12345');

    expect(result.cveId).toBe('CVE-2024-12345');
    expect(result.cvssV3Score).toBe(7.5);
    expect(result.cvssV3Vector).toContain('CVSS:3.1');
    expect(result.summary).toBe('Test summary.');
  });

  it('throws NvdNotFoundError on empty vulnerabilities array', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ vulnerabilities: [] }),
    });
    await expect(makeClient(fetchImpl).fetchCve('CVE-9999-9999')).rejects.toBeInstanceOf(
      NvdNotFoundError,
    );
  });

  it('throws NvdRateLimitedError on 429', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(rateLimited429(null));
    await expect(makeClient(fetchImpl).fetchCve('CVE-2024-1')).rejects.toBeInstanceOf(
      NvdRateLimitedError,
    );
  });

  it('attaches Retry-After (delta-seconds) to NvdRateLimitedError', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(rateLimited429('30'));
    try {
      await makeClient(fetchImpl).fetchCve('CVE-2024-1');
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(NvdRateLimitedError);
      expect((err as NvdRateLimitedError).retryAfterMs).toBe(30_000);
    }
  });

  it('attaches null retryAfterMs when Retry-After header is absent', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(rateLimited429(null));
    try {
      await makeClient(fetchImpl).fetchCve('CVE-2024-1');
      throw new Error('expected throw');
    } catch (err) {
      expect((err as NvdRateLimitedError).retryAfterMs).toBeNull();
    }
  });

  it('retries 500 with backoff and eventually succeeds', async () => {
    const okResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        vulnerabilities: [
          {
            cve: {
              id: 'CVE-2024-2',
              published: '2024-01-01T00:00:00.000',
              lastModified: '2024-02-01T00:00:00.000',
              descriptions: [{ lang: 'en', value: 'Summary.' }],
              metrics: {},
            },
          },
        ],
      }),
    };
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'err' })
      .mockResolvedValueOnce({ ok: false, status: 502, text: async () => 'err' })
      .mockResolvedValueOnce(okResponse);

    const result = await makeClient(fetchImpl).fetchCve('CVE-2024-2');
    expect(result.cveId).toBe('CVE-2024-2');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('uses apiHeader when apiKey provided', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        vulnerabilities: [
          {
            cve: {
              id: 'CVE-2024-3',
              published: '2024-01-01T00:00:00.000',
              lastModified: '2024-02-01T00:00:00.000',
              descriptions: [{ lang: 'en', value: 'x' }],
              metrics: {},
            },
          },
        ],
      }),
    });
    const client = new NvdClient({
      apiKey: 'KEY',
      rateLimiter: new TokenBucketRateLimiter({ capacity: 50, refillIntervalMs: 30_000 }),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      backoffBaseMs: 1,
      maxRetries: 1,
    });
    await client.fetchCve('CVE-2024-3');
    const headers = (fetchImpl.mock.calls[0][1] as { headers: Record<string, string> }).headers;
    expect(headers.apiKey).toBe('KEY');
  });
});

describe('parseRetryAfter', () => {
  const NOW = Date.parse('2026-06-08T12:00:00Z');

  it('parses non-negative integer seconds to ms', () => {
    expect(parseRetryAfter('30', NOW)).toBe(30_000);
    expect(parseRetryAfter('0', NOW)).toBe(0);
  });

  it('parses HTTP-date to ms-from-now and clamps past dates to 0', () => {
    expect(parseRetryAfter('Mon, 08 Jun 2026 12:00:30 GMT', NOW)).toBe(30_000);
    expect(parseRetryAfter('Mon, 08 Jun 2026 11:00:00 GMT', NOW)).toBe(0);
  });

  it('returns null for absent, blank, or unparseable values', () => {
    expect(parseRetryAfter(null, NOW)).toBeNull();
    expect(parseRetryAfter('', NOW)).toBeNull();
    expect(parseRetryAfter('   ', NOW)).toBeNull();
    expect(parseRetryAfter('not-a-date', NOW)).toBeNull();
  });
});

// Spec §5: opt-in sanity-check that hits the real NVD API. Gated on
// NVD_E2E=1 so unit-test runs and CI without outbound network stay
// hermetic. CVE-2014-0160 (Heartbleed) is picked because it is well
// established and unlikely to be retracted from the NVD catalog.
const nvdE2e = process.env.NVD_E2E === '1' ? describe : describe.skip;
nvdE2e('NvdClient — real NVD sanity check (NVD_E2E=1)', () => {
  jest.setTimeout(30_000);

  it('fetches CVE-2014-0160 (Heartbleed) with a CVSS v3 score', async () => {
    const client = new NvdClient({
      apiKey: process.env.NVD_API_KEY || undefined,
      rateLimiter: new TokenBucketRateLimiter({
        capacity: process.env.NVD_API_KEY ? 50 : 5,
        refillIntervalMs: 30_000,
      }),
    });
    const cve = await client.fetchCve('CVE-2014-0160');
    expect(cve.cveId).toBe('CVE-2014-0160');
    expect(typeof cve.summary).toBe('string');
    expect((cve.summary as string).length).toBeGreaterThan(20);
    expect(cve.cvssV3Score).toBeGreaterThan(0);
    expect(cve.publishedAt).toBeInstanceOf(Date);
  });
});
