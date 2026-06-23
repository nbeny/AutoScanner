import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

/** Parser for subjs stdout (one JS file URL per line). Deduped → endpoints[]. */
@Injectable()
export class SubjsTextParser implements Parser {
  readonly name = 'subjs-text';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    const seen = new Set<string>();
    for (const raw of text.split('\n')) {
      const url = raw.trim();
      if (!/^https?:\/\/\S+$/i.test(url)) continue;
      if (seen.has(url)) continue;
      seen.add(url);
      out.endpoints.push({ url });
    }
    return out;
  }
}
