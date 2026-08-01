import { Injectable, Logger } from '@nestjs/common';

import type { ThreatIntelSource, ThreatLookupInput, ThreatSignal } from './threat-intel-source';

const KEV_URL =
  'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';
const CACHE_TTL_MS = 6 * 3_600_000; // 6h

/** Injectable fetcher so tests never hit the network. */
export type KevFetcher = () => Promise<Set<string>>;

async function fetchKevFromCisa(): Promise<Set<string>> {
  const res = await fetch(KEV_URL);
  if (!res.ok) throw new Error(`CISA KEV ${res.status}`);
  const body = (await res.json()) as { vulnerabilities?: Array<{ cveID?: string }> };
  return new Set((body.vulnerabilities ?? []).map((v) => v.cveID).filter((c): c is string => !!c));
}

/**
 * CISA Known Exploited Vulnerabilities — key-free, CVE-keyed. A finding whose CVE is on the KEV
 * catalog is under active exploitation in the wild, which is the single strongest risk signal
 * short of a confirmed compromise. The catalog is cached for 6h; the actual fetch is injected so
 * the enrichment logic is unit-tested without a network call.
 */
@Injectable()
export class KevSource implements ThreatIntelSource {
  readonly name = 'cisa-kev';
  private readonly logger = new Logger(KevSource.name);
  private cache: { at: number; set: Set<string> } | null = null;

  constructor(private readonly fetcher: KevFetcher = fetchKevFromCisa) {}

  private async kevSet(nowMs: number): Promise<Set<string>> {
    if (this.cache && nowMs - this.cache.at < CACHE_TTL_MS) return this.cache.set;
    const set = await this.fetcher();
    this.cache = { at: nowMs, set };
    return set;
  }

  async lookup(input: ThreatLookupInput): Promise<ThreatSignal[]> {
    if (!input.cveId) return [];
    let set: Set<string>;
    try {
      set = await this.kevSet(Date.now());
    } catch (err) {
      this.logger.warn(`KEV fetch failed: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
    if (!set.has(input.cveId)) return [];
    return [
      {
        indicator: input.cveId,
        kind: 'ACTIVE_EXPLOITATION',
        source: this.name,
        severity: 'CRITICAL',
        payload: { catalog: 'CISA KEV' },
      },
    ];
  }
}
