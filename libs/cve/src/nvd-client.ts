import type { TokenBucketRateLimiter } from './rate-limiter';

const NVD_URL = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
const CPE_RESULTS_PER_PAGE = 2000;

export class NvdNotFoundError extends Error {
  constructor(cveId: string) {
    super(`CVE not found in NVD: ${cveId}`);
    this.name = 'NvdNotFoundError';
  }
}

export class NvdRateLimitedError extends Error {
  /**
   * Milliseconds the caller should wait before retrying, parsed from the
   * 429 response's `Retry-After` header (RFC 7231 §7.1.3 — either a
   * non-negative integer of seconds or an HTTP-date). `null` when the
   * header was absent or unparseable.
   */
  readonly retryAfterMs: number | null;

  constructor(retryAfterMs: number | null = null) {
    super('NVD rate-limited (HTTP 429)');
    this.name = 'NvdRateLimitedError';
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Parse RFC 7231 `Retry-After`. Returns ms ≥ 0 or null if absent/invalid.
 * Per RFC the value is either delta-seconds (a non-negative integer) or
 * an HTTP-date. We accept both and clamp negatives to 0.
 */
export function parseRetryAfter(headerValue: string | null, nowMs: number): number | null {
  if (!headerValue) return null;
  const trimmed = headerValue.trim();
  if (trimmed === '') return null;
  if (/^\d+$/.test(trimmed)) {
    return Math.max(0, Number(trimmed) * 1000);
  }
  const dateMs = Date.parse(trimmed);
  if (Number.isNaN(dateMs)) return null;
  return Math.max(0, dateMs - nowMs);
}

export interface NvdCveData {
  cveId: string;
  cvssV3Score: number | null;
  cvssV3Vector: string | null;
  summary: string | null;
  publishedAt: Date | null;
  lastModified: Date | null;
}

export interface CpeCveMatch {
  cveId: string;
  cvssScore: number | null;
}

export interface NvdClientOptions {
  apiKey: string | undefined;
  rateLimiter: TokenBucketRateLimiter;
  fetchImpl?: typeof fetch;
  backoffBaseMs?: number;
  maxRetries?: number;
}

interface NvdResponse {
  vulnerabilities: NvdVulnerability[];
}

// --- New exported types for paged NVD responses (phase-8.7a) ---

export interface NvdCpeMatchData {
  vulnerable: boolean;
  criteria: string;
  versionStartIncluding?: string;
  versionStartExcluding?: string;
  versionEndIncluding?: string;
  versionEndExcluding?: string;
}

export interface NvdConfigNodeData {
  operator: 'AND' | 'OR';
  negate: boolean;
  cpeMatch: NvdCpeMatchData[];
}

export interface NvdFullCve {
  cveId: string;
  cvssV3Score: number | null;
  cvssV3Vector: string | null;
  summary: string | null;
  publishedAt: Date | null;
  lastModified: Date | null;
  nodes: NvdConfigNodeData[];
}

export interface FetchCvePageParams {
  startIndex: number;
  resultsPerPage: number;
  lastModStartDate?: string;
  lastModEndDate?: string;
}

export interface NvdCvePage {
  totalResults: number;
  cves: NvdFullCve[];
}

// Internal shape for a single CPE-match entry in configurations
interface RawCpeMatch {
  vulnerable?: boolean;
  criteria?: string;
  matchCriteriaId?: string;
  versionStartIncluding?: string;
  versionStartExcluding?: string;
  versionEndIncluding?: string;
  versionEndExcluding?: string;
}

// Internal shape for a configuration node
interface RawConfigNode {
  operator?: string;
  negate?: boolean;
  cpeMatch?: RawCpeMatch[];
}

// Internal shape for a configurations entry
interface RawConfiguration {
  operator?: string;
  negate?: boolean;
  nodes?: RawConfigNode[];
}

// Widened vulnerability shape used by both NvdResponse and NvdListResponse
interface NvdVulnerability {
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
    configurations?: RawConfiguration[];
  };
}

interface NvdListResponse {
  totalResults: number;
  resultsPerPage: number;
  startIndex: number;
  vulnerabilities: NvdVulnerability[];
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
        if (response.status === 429) {
          const retryAfter = parseRetryAfter(
            response.headers?.get?.('retry-after') ?? null,
            Date.now(),
          );
          throw new NvdRateLimitedError(retryAfter);
        }
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

  async findCvesByCpe(cpe: string): Promise<CpeCveMatch[]> {
    const paramKey = cpe.startsWith('cpe:2.3:') ? 'cpeName' : 'virtualMatchString';
    const encoded = encodeURIComponent(cpe);
    const results: CpeCveMatch[] = [];
    let startIndex = 0;
    let totalResults = 1; // initialise to >0 so we enter the loop

    while (startIndex < totalResults) {
      const url = `${NVD_URL}?${paramKey}=${encoded}&resultsPerPage=${CPE_RESULTS_PER_PAGE}&startIndex=${startIndex}`;
      let lastErr: unknown;
      let body: NvdListResponse | null = null;

      for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
        await this.rateLimiter.acquire();
        try {
          const response = await this.fetchImpl(url, {
            method: 'GET',
            headers: this.apiKey ? { apiKey: this.apiKey } : {},
          });

          if (response.status === 404) return results;
          if (response.status === 429) {
            const retryAfter = parseRetryAfter(
              response.headers?.get?.('retry-after') ?? null,
              Date.now(),
            );
            throw new NvdRateLimitedError(retryAfter);
          }
          if (response.status >= 500) {
            lastErr = new Error(`NVD HTTP ${response.status}`);
            await this.sleep(this.backoffMs(attempt));
            continue;
          }
          if (!response.ok) {
            throw new Error(`NVD HTTP ${response.status}: ${await response.text()}`);
          }

          body = (await response.json()) as NvdListResponse;
          break;
        } catch (err) {
          if (err instanceof NvdRateLimitedError) throw err;
          lastErr = err;
          if (attempt < this.maxRetries - 1) {
            await this.sleep(this.backoffMs(attempt));
          }
        }
      }

      if (body === null) {
        throw lastErr instanceof Error ? lastErr : new Error('NVD CPE fetch failed');
      }

      totalResults = body.totalResults;
      const page = body.vulnerabilities ?? [];
      if (page.length === 0) break;

      for (const entry of page) {
        results.push({
          cveId: entry.cve.id,
          cvssScore: this.extractCvssScore(entry.cve.metrics),
        });
      }

      startIndex += page.length;
    }

    return results;
  }

  private parse(entry: NvdResponse['vulnerabilities'][number]): NvdCveData {
    const cve = entry.cve;
    const desc = cve.descriptions.find((d) => d.lang === 'en') ?? cve.descriptions[0];
    const metric = this.extractCvssMetric(cve.metrics);
    return {
      cveId: cve.id,
      cvssV3Score: metric?.baseScore ?? null,
      cvssV3Vector: metric?.vectorString ?? null,
      summary: desc?.value ?? null,
      publishedAt: cve.published ? new Date(cve.published) : null,
      lastModified: cve.lastModified ? new Date(cve.lastModified) : null,
    };
  }

  private extractCvssMetric(
    metrics: NvdResponse['vulnerabilities'][number]['cve']['metrics'],
  ): { baseScore: number; vectorString: string } | undefined {
    return metrics?.cvssMetricV31?.[0]?.cvssData ?? metrics?.cvssMetricV30?.[0]?.cvssData;
  }

  private extractCvssScore(
    metrics: NvdResponse['vulnerabilities'][number]['cve']['metrics'],
  ): number | null {
    return this.extractCvssMetric(metrics)?.baseScore ?? null;
  }

  async fetchCvePage(params: FetchCvePageParams): Promise<NvdCvePage> {
    const sp = new URLSearchParams({
      resultsPerPage: String(params.resultsPerPage),
      startIndex: String(params.startIndex),
    });
    if (params.lastModStartDate) sp.set('lastModStartDate', params.lastModStartDate);
    if (params.lastModEndDate) sp.set('lastModEndDate', params.lastModEndDate);
    const url = `${NVD_URL}?${sp.toString()}`;

    const body = await this.getCveListPage(url);
    if (body === null) return { totalResults: 0, cves: [] };

    const cves: NvdFullCve[] = (body.vulnerabilities ?? []).map((entry) => {
      const cve = entry.cve;
      const metric = this.extractCvssMetric(cve.metrics);
      const desc =
        (cve.descriptions ?? []).find((d) => d.lang === 'en') ?? (cve.descriptions ?? [])[0];
      return {
        cveId: cve.id,
        cvssV3Score: metric?.baseScore ?? null,
        cvssV3Vector: metric?.vectorString ?? null,
        summary: desc?.value ?? null,
        publishedAt: cve.published ? new Date(cve.published) : null,
        lastModified: cve.lastModified ? new Date(cve.lastModified) : null,
        nodes: this.parseConfigurations(cve.configurations),
      };
    });

    return { totalResults: body.totalResults ?? cves.length, cves };
  }

  private async getCveListPage(url: string): Promise<NvdListResponse | null> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      await this.rateLimiter.acquire();
      try {
        const response = await this.fetchImpl(url, {
          method: 'GET',
          headers: this.apiKey ? { apiKey: this.apiKey } : {},
        });

        if (response.status === 404) return null;
        if (response.status === 429) {
          const retryAfter = parseRetryAfter(
            response.headers?.get?.('retry-after') ?? null,
            Date.now(),
          );
          throw new NvdRateLimitedError(retryAfter);
        }
        if (response.status >= 500) {
          lastErr = new Error(`NVD HTTP ${response.status}`);
          await this.sleep(this.backoffMs(attempt));
          continue;
        }
        if (!response.ok) {
          throw new Error(`NVD HTTP ${response.status}: ${await response.text()}`);
        }

        return (await response.json()) as NvdListResponse;
      } catch (err) {
        if (err instanceof NvdRateLimitedError) throw err;
        lastErr = err;
        if (attempt < this.maxRetries - 1) {
          await this.sleep(this.backoffMs(attempt));
        }
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('NVD fetch failed');
  }

  private parseConfigurations(configs: RawConfiguration[] | undefined): NvdConfigNodeData[] {
    if (!configs) return [];
    const result: NvdConfigNodeData[] = [];
    for (const config of configs) {
      for (const node of config.nodes ?? []) {
        result.push({
          operator: node.operator === 'AND' ? 'AND' : 'OR',
          negate: Boolean(node.negate),
          cpeMatch: (node.cpeMatch ?? []).map((m) => ({
            vulnerable: Boolean(m.vulnerable),
            criteria: m.criteria ?? '',
            versionStartIncluding: m.versionStartIncluding,
            versionStartExcluding: m.versionStartExcluding,
            versionEndIncluding: m.versionEndIncluding,
            versionEndExcluding: m.versionEndExcluding,
          })),
        });
      }
    }
    return result;
  }

  private backoffMs(attempt: number): number {
    return Math.min(this.backoffBaseMs * 2 ** attempt, 16_000);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
