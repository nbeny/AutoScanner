import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

const SEED_RE = /^##\s*SEED\s+(.+)$/;
// phoneinfoga's local scanner prints "Label: value" lines (Country, Carrier,
// Line type, E164, International, …). We collect them verbatim per seed.
const KV_RE = /^([A-Za-z][A-Za-z0-9 /_-]{1,30}):\s*(.+)$/;

/**
 * Parser for phoneinfoga `scan` stdout. `## SEED <number>` markers (emitted by
 * the scanner's build script) delimit each number. The key/value lines the local
 * (libphonenumber) scanner prints are collected into one OrgMetadata record per
 * number, plus a single INFO finding summarising country/carrier so the number
 * surfaces in the report. Tolerant of banners and blank lines.
 */
@Injectable()
export class PhoneinfogaTextParser implements Parser {
  readonly name = 'phoneinfoga-text';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    let seed = '';
    let fields: Record<string, string> = {};

    const flush = () => {
      if (!seed || Object.keys(fields).length === 0) return;
      out.orgMetadata.push({
        kind: 'OTHER',
        data: { number: seed, source: 'phoneinfoga', ...fields },
      });
      const country = fields['Country'] ?? fields['Country code'] ?? '';
      const carrier = fields['Carrier'] ?? '';
      const summary = [country, carrier].filter(Boolean).join(' / ');
      out.findings.push({
        scannerName: ctx.scannerName,
        title: `Phone number profiled: ${seed}${summary ? ` (${summary})` : ''}`,
        severity: 'INFO',
        location: seed,
        evidence: fields,
      });
    };

    for (const raw of text.split('\n')) {
      const line = raw.trim();
      const seedMatch = line.match(SEED_RE);
      if (seedMatch) {
        flush();
        seed = seedMatch[1].trim();
        fields = {};
        continue;
      }
      const kv = line.match(KV_RE);
      if (kv && seed) fields[kv[1].trim()] = kv[2].trim();
    }
    flush();
    return out;
  }
}
