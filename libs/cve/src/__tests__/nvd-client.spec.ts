import { NvdClient, NvdNotFoundError, NvdRateLimitedError } from '../nvd-client';
import { TokenBucketRateLimiter } from '../rate-limiter';

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
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    });
    await expect(makeClient(fetchImpl).fetchCve('CVE-2024-1')).rejects.toBeInstanceOf(
      NvdRateLimitedError,
    );
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
