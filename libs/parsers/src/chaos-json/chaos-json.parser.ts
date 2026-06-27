import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface ChaosRow {
  domain?: string;
  subdomain?: string;
}

/**
 * Parser for `chaos -silent -json` stdout (JSONL). Each line is one row;
 * the FQDN is `<subdomain>.<domain>` (or just <domain> for the apex row).
 * Duplicates within the stream are collapsed.
 */
@Injectable()
export class ChaosJsonParser implements Parser {
  readonly name = 'chaos-json';
  readonly formats: RawOutputFormat[] = ['JSONL'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    const seen = new Set<string>();
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      let row: ChaosRow;
      try {
        row = JSON.parse(line) as ChaosRow;
      } catch {
        continue;
      }
      const domain = row.domain?.trim().toLowerCase();
      if (!domain) continue;
      const sub = row.subdomain?.trim().toLowerCase();
      const fqdn = sub ? `${sub}.${domain}` : domain;
      if (seen.has(fqdn)) continue;
      seen.add(fqdn);
      out.assets.push({ type: 'SUBDOMAIN', value: fqdn });
    }
    return out;
  }
}
