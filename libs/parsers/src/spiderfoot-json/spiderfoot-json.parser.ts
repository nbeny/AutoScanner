import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface SfEvent {
  type?: string;
  data?: string;
  module?: string;
}

const NAME_TYPES = new Set(['INTERNET_NAME', 'CO_HOSTED_SITE', 'AFFILIATE_INTERNET_NAME']);

/**
 * Parser for SpiderFoot's `-o json` output (a JSON array of event objects with
 * { type, data, module }). Events are fanned out by type into the normalised
 * shape; vulnerability/malicious events become findings. Unknown event types
 * are ignored. Tolerant of blank / malformed input.
 */
@Injectable()
export class SpiderfootJsonParser implements Parser {
  readonly name = 'spiderfoot-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    let arr: unknown;
    try {
      arr = JSON.parse(text);
    } catch {
      return out;
    }
    if (!Array.isArray(arr)) return out;

    for (const ev of arr as SfEvent[]) {
      const type = ev.type;
      const data = ev.data;
      if (!type || !data) continue;

      if (type === 'EMAILADDR') {
        out.emails.push({ address: data, source: 'spiderfoot' });
      } else if (type === 'IP_ADDRESS') {
        out.assets.push({ type: 'IP', value: data });
      } else if (NAME_TYPES.has(type)) {
        out.assets.push({ type: 'SUBDOMAIN', value: data.toLowerCase().replace(/\.$/, '') });
      } else if (type.includes('VULNERABILITY') || type.startsWith('MALICIOUS_')) {
        out.findings.push({
          scannerName: ctx.scannerName,
          title: `SpiderFoot ${type}`,
          severity: 'HIGH',
          location: ctx.target,
          description: data,
          evidence: ev,
        });
      }
    }
    return out;
  }
}
