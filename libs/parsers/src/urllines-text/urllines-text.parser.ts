import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

/**
 * Shared parser for tools that emit one URL per stdout line
 * (gau, waybackurls, ...). Skips blank lines and `#` comments, dedupes
 * within a single run, and records each URL as an endpoint with method GET.
 * Paths are NOT lowercased — URL paths are case-sensitive; canonicalisation
 * happens in the persister.
 */
@Injectable()
export class UrllinesTextParser implements Parser {
  readonly name = 'urllines-text';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    const seen = new Set<string>();

    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      if (seen.has(trimmed)) continue;
      seen.add(trimmed);
      out.endpoints.push({ url: trimmed, method: 'GET' });
    }

    return out;
  }
}
