import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;
// A hit line carries a positive marker ([+] or [ + ]) and the source URL.
const POSITIVE_RE = /\[\s*\+\s*\]/;
const URL_RE = /https?:\/\/\S+/;

@Injectable()
export class MantraTextParser implements Parser {
  readonly name = 'mantra-text';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = (typeof input === 'string' ? input : input.toString('utf8')).replace(ANSI_RE, '');
    if (!text.trim()) return out;

    const seen = new Set<string>();
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line || !POSITIVE_RE.test(line)) continue;
      const urlMatch = line.match(URL_RE);
      if (!urlMatch) continue;
      const location = urlMatch[0];
      // Dedup on the whole line (URL + matched value).
      if (seen.has(line)) continue;
      seen.add(line);
      out.findings.push({
        scannerName: ctx.scannerName,
        title: 'Secret/API key exposed in web response',
        severity: 'MEDIUM',
        location,
        description: line,
      });
    }
    return out;
  }
}
