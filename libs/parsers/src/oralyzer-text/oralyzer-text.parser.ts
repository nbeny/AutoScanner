import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;
// Oralyzer flags a hit with a positive marker AND (for open redirect) prints the
// controllable URL. Require a URL on the line to avoid banner/legend false hits.
// The generic word "vulnerable" is deliberately excluded — it also appears in
// negative "not vulnerable" lines.
const POSITIVE_RE = /(open redirect|\[\+\]|\[!\])/i;

/**
 * Parser for Oralyzer stdout. Lines that carry a positive marker and a URL become
 * MEDIUM open-redirect findings (deduplicated). Negative (`[-]`) and banner lines
 * are ignored.
 */
@Injectable()
export class OralyzerTextParser implements Parser {
  readonly name = 'oralyzer-text';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    const seen = new Set<string>();
    for (const raw of text.split('\n')) {
      const line = raw.replace(ANSI_RE, '').trim();
      if (!line || line.startsWith('[-]')) continue;
      if (!POSITIVE_RE.test(line) || !line.includes('://')) continue;
      const urlMatch = line.match(/https?:\/\/\S+/);
      const location = urlMatch ? urlMatch[0] : ctx.target;
      if (seen.has(location)) continue;
      seen.add(location);
      out.findings.push({
        scannerName: ctx.scannerName,
        title: 'Open redirect (possible)',
        severity: 'MEDIUM',
        location,
        description: line,
      });
    }
    return out;
  }
}
