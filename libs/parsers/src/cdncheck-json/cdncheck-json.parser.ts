import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface CdncheckRecord {
  input?: string;
  cdn?: boolean;
  cdn_name?: string;
  cloud?: boolean;
  cloud_name?: string;
  waf?: boolean;
  waf_name?: string;
}

@Injectable()
export class CdncheckJsonParser implements Parser {
  readonly name = 'cdncheck-json';
  readonly formats: RawOutputFormat[] = ['JSONL'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    for (const line of text.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      let rec: CdncheckRecord;
      try {
        rec = JSON.parse(t) as CdncheckRecord;
      } catch {
        continue;
      }

      const assetValue = typeof rec.input === 'string' ? rec.input : ctx.target;

      if (rec.cdn && typeof rec.cdn_name === 'string' && rec.cdn_name) {
        out.technologies.push({ assetValue, name: `CDN: ${rec.cdn_name}`, categories: ['cdn'] });
      }
      if (rec.cloud && typeof rec.cloud_name === 'string' && rec.cloud_name) {
        out.technologies.push({
          assetValue,
          name: `cloud: ${rec.cloud_name}`,
          categories: ['cdn'],
        });
      }
      if (rec.waf && typeof rec.waf_name === 'string' && rec.waf_name) {
        out.technologies.push({ assetValue, name: `WAF: ${rec.waf_name}`, categories: ['waf'] });
      }
    }
    return out;
  }
}
