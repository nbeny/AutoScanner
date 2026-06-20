import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

const URL_RE = /https?:\/\/[^\s)]+/i;

@Injectable()
export class CloudbruteTextParser implements Parser {
  readonly name = 'cloudbrute-text';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    const seen = new Set<string>();
    for (const line of text.split('\n')) {
      const m = line.match(URL_RE);
      if (!m) continue;
      const url = m[0].replace(/\/+$/, '');
      if (seen.has(url)) continue;
      seen.add(url);
      out.findings.push({
        scannerName: 'cloudbrute',
        title: 'Public cloud resource discovered',
        severity: 'LOW',
        location: url,
        evidence: { url },
      });
    }

    return out;
  }
}
