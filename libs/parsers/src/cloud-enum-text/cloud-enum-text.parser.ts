import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

const URL_RE = /https?:\/\/[^\s)]+/i;

@Injectable()
export class CloudEnumTextParser implements Parser {
  readonly name = 'cloud-enum-text';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    const buckets: { url: string; access: string }[] = [];
    for (const line of text.split('\n')) {
      const m = line.match(URL_RE);
      if (!m) continue;
      const lower = line.toLowerCase();
      const isOpen = lower.includes('open');
      const access = isOpen ? 'open' : 'protected';
      const url = m[0].replace(/\/+$/, '');
      if (buckets.some((b) => b.url === url)) continue;
      buckets.push({ url, access });
      if (isOpen) {
        out.findings.push({
          scannerName: ctx.scannerName,
          title: 'Publicly accessible cloud storage bucket',
          severity: 'HIGH',
          location: url,
          description: 'cloud_enum reported this bucket as OPEN (publicly listable/readable).',
        });
      }
    }
    if (buckets.length > 0) out.orgMetadata.push({ kind: 'CLOUD_BUCKET', data: { buckets } });
    return out;
  }
}
