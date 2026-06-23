import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

const CIDR_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\/\d{1,2}\b/;

/**
 * Parser for `metabigor net --org --json` output (one JSON object per line).
 * Each line yields a NETBLOCK asset (the CIDR) plus an ASN orgMetadata record.
 * Lines that are not valid JSON are scanned for a bare CIDR as a fallback, so
 * the parser is robust to metabigor's text/JSON format drift across versions.
 */
@Injectable()
export class MetabigorJsonParser implements Parser {
  readonly name = 'metabigor-json';
  readonly formats: RawOutputFormat[] = ['JSONL'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    const seen = new Set<string>();
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      let rec: Record<string, unknown> | undefined;
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object') rec = parsed as Record<string, unknown>;
      } catch {
        rec = undefined;
      }

      let cidr: string | undefined;
      if (rec) {
        for (const v of Object.values(rec)) {
          if (typeof v === 'string' && CIDR_RE.test(v)) {
            cidr = (v.match(CIDR_RE) as RegExpMatchArray)[0];
            break;
          }
        }
        out.orgMetadata.push({ kind: 'ASN', data: rec });
      } else {
        const m = trimmed.match(CIDR_RE);
        if (m) cidr = m[0];
      }

      if (cidr && !seen.has(cidr)) {
        seen.add(cidr);
        out.assets.push({ type: 'NETBLOCK', value: cidr });
      }
    }
    return out;
  }
}
