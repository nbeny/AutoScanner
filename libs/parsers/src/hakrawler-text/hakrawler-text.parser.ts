import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

const URL_RE = /^https?:\/\/\S+$/;

@Injectable()
export class HakrawlerTextParser implements Parser {
  readonly name = 'hakrawler-text';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    for (const raw of text.split('\n')) {
      const url = raw.trim();
      if (!url || !URL_RE.test(url)) continue;
      out.endpoints.push({ url, method: 'GET' });
    }
    return out;
  }
}
