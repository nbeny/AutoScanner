import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6_RE = /^[0-9a-fA-F:]+:[0-9a-fA-F:]*$/;

/**
 * Shared parser for tools that emit one IP address per stdout line (mapcidr,
 * ...). Validates each line as IPv4 or IPv6, drops blanks/`#` comments/junk,
 * and dedupes within a single run. Each survivor becomes an IP asset.
 */
@Injectable()
export class IplinesTextParser implements Parser {
  readonly name = 'iplines-text';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    const seen = new Set<string>();

    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      if (!IPV4_RE.test(trimmed) && !IPV6_RE.test(trimmed)) continue;
      if (seen.has(trimmed)) continue;
      seen.add(trimmed);
      out.assets.push({ type: 'IP', value: trimmed });
    }
    return out;
  }
}
