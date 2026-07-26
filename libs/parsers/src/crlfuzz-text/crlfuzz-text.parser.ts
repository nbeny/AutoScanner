import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

// Strip ANSI colour codes crlfuzz may emit.
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;

/**
 * Parser for crlfuzz `-s` (silent) stdout, which prints one vulnerable URL per
 * line. Each URL becomes a HIGH CRLF-injection finding. Non-URL noise is ignored.
 */
@Injectable()
export class CrlfuzzTextParser implements Parser {
  readonly name = 'crlfuzz-text';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    const seen = new Set<string>();
    for (const raw of text.split('\n')) {
      const line = raw.replace(ANSI_RE, '').trim();
      const idx = line.indexOf('http');
      if (idx === -1 || !line.includes('://')) continue;
      const url = line.slice(idx).split(/\s+/)[0];
      if (!url || seen.has(url)) continue;
      seen.add(url);
      out.findings.push({
        scannerName: ctx.scannerName,
        title: 'CRLF injection / HTTP response splitting',
        severity: 'HIGH',
        location: url,
        description: 'crlfuzz reflected an injected CRLF sequence into the response headers.',
      });
    }
    return out;
  }
}
