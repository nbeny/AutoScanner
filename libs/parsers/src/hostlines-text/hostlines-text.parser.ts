import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

/**
 * Shared parser for tools that emit one hostname per stdout line
 * (findomain, amass passive, assetfinder, puredns). Canonicalises each host
 * (trim, lowercase, strip trailing dot), drops blanks and `#` comments, and
 * dedupes within a single run. Correlation handles cross-run / cross-scanner
 * merge downstream.
 */
@Injectable()
export class HostlinesTextParser implements Parser {
  readonly name = 'hostlines-text';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    const seen = new Set<string>();

    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const host = trimmed.toLowerCase().replace(/\.$/, '');
      if (!host || seen.has(host)) continue;
      seen.add(host);
      out.assets.push({ type: 'SUBDOMAIN', value: host });
    }

    return out;
  }
}
