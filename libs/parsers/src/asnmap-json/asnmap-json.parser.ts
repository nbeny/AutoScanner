import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface AsnmapRecord {
  as_number?: string;
  as_name?: string;
  as_country?: string;
  as_range?: string[] | string;
}

@Injectable()
export class AsnmapJsonParser implements Parser {
  readonly name = 'asnmap-json';
  readonly formats: RawOutputFormat[] = ['JSONL'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    const byAsn = new Map<
      string,
      { asn: string; name?: string; country?: string; cidrs: Set<string> }
    >();
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let rec: AsnmapRecord;
      try {
        rec = JSON.parse(trimmed) as AsnmapRecord;
      } catch {
        continue;
      }
      const asn = typeof rec.as_number === 'string' ? rec.as_number : undefined;
      if (!asn) continue;
      const entry = byAsn.get(asn) ?? {
        asn,
        name: rec.as_name,
        country: rec.as_country,
        cidrs: new Set<string>(),
      };
      const ranges = Array.isArray(rec.as_range)
        ? rec.as_range
        : rec.as_range
          ? [rec.as_range]
          : [];
      for (const r of ranges) if (typeof r === 'string' && r) entry.cidrs.add(r);
      byAsn.set(asn, entry);
    }

    for (const e of byAsn.values()) {
      out.orgMetadata.push({
        kind: 'ASN',
        data: { asn: e.asn, name: e.name, country: e.country, cidrs: Array.from(e.cidrs) },
      });
    }
    return out;
  }
}
