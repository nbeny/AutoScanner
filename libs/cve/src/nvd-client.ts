import type { TokenBucketRateLimiter } from './rate-limiter';

const NVD_URL = 'https://services.nvd.nist.gov/rest/json/cves/2.0';

export class NvdNotFoundError extends Error {
  constructor(cveId: string) {
    super(`CVE not found in NVD: ${cveId}`);
    this.name = 'NvdNotFoundError';
  }
}

export class NvdRateLimitedError extends Error {
  constructor() {
    super('NVD rate-limited (HTTP 429)');
    this.name = 'NvdRateLimitedError';
  }
}

export interface NvdCveData {
  cveId: string;
  cvssV3Score: number | null;
  cvssV3Vector: string | null;
  summary: string | null;
  publishedAt: Date | null;
  lastModified: Date | null;
}

export interface NvdClientOptions {
  apiKey: string | undefined;
  rateLimiter: TokenBucketRateLimiter;
  fetchImpl?: typeof fetch;
  backoffBaseMs?: number;
  maxRetries?: number;
}

interface NvdResponse {
  vulnerabilities: Array<{
    cve: {
      id: string;
      published: string;
      lastModified: string;
      descriptions: Array<{ lang: string; value: string }>;
      metrics?: {
        cvssMetricV31?: Array<{
          cvssData: { baseScore: number; vectorString: string };
        }>;
        cvssMetricV30?: Array<{
          cvssData: { baseScore: number; vectorString: string };
        }>;
      };
    };
  }>;
}

export class NvdClient {
  private readonly apiKey: string | undefined;
  private readonly rateLimiter: TokenBucketRateLimiter;
  private readonly fetchImpl: typeof fetch;
  private readonly backoffBaseMs: number;
  private readonly maxRetries: number;

  constructor(opts: NvdClientOptions) {
    this.apiKey = opts.apiKey;
    this.rateLimiter = opts.rateLimiter;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.backoffBaseMs = opts.backoffBaseMs ?? 1_000;
    this.maxRetries = opts.maxRetries ?? 5;
  }

  async fetchCve(cveId: string): Promise<NvdCveData> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      await this.rateLimiter.acquire();
      try {
        const response = await this.fetchImpl(`${NVD_URL}?cveId=${encodeURIComponent(cveId)}`, {
          method: 'GET',
          headers: this.apiKey ? { apiKey: this.apiKey } : {},
        });

        if (response.status === 404) throw new NvdNotFoundError(cveId);
        if (response.status === 429) throw new NvdRateLimitedError();
        if (response.status >= 500) {
          lastErr = new Error(`NVD HTTP ${response.status}`);
          await this.sleep(this.backoffMs(attempt));
          continue;
        }
        if (!response.ok) {
          throw new Error(`NVD HTTP ${response.status}: ${await response.text()}`);
        }

        const body = (await response.json()) as NvdResponse;
        if (!body.vulnerabilities || body.vulnerabilities.length === 0) {
          throw new NvdNotFoundError(cveId);
        }
        return this.parse(body.vulnerabilities[0]);
      } catch (err) {
        if (err instanceof NvdNotFoundError || err instanceof NvdRateLimitedError) {
          throw err;
        }
        lastErr = err;
        if (attempt < this.maxRetries - 1) {
          await this.sleep(this.backoffMs(attempt));
        }
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('NVD fetch failed');
  }

  private parse(entry: NvdResponse['vulnerabilities'][number]): NvdCveData {
    const cve = entry.cve;
    const desc = cve.descriptions.find((d) => d.lang === 'en') ?? cve.descriptions[0];
    const metric =
      cve.metrics?.cvssMetricV31?.[0]?.cvssData ?? cve.metrics?.cvssMetricV30?.[0]?.cvssData;
    return {
      cveId: cve.id,
      cvssV3Score: metric?.baseScore ?? null,
      cvssV3Vector: metric?.vectorString ?? null,
      summary: desc?.value ?? null,
      publishedAt: cve.published ? new Date(cve.published) : null,
      lastModified: cve.lastModified ? new Date(cve.lastModified) : null,
    };
  }

  private backoffMs(attempt: number): number {
    return Math.min(this.backoffBaseMs * 2 ** attempt, 16_000);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
