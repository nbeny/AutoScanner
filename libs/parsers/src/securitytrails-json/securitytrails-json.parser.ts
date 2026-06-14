import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface StResponse {
  subdomains?: unknown;
}

@Injectable()
export class SecuritytrailsJsonParser implements Parser {
  readonly name = 'securitytrails-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    let parsed: StResponse;
    try {
      parsed = JSON.parse(text) as StResponse;
    } catch {
      return out;
    }

    const labels = parsed.subdomains;
    if (!Array.isArray(labels)) return out;

    const apex = ctx.target.trim().toLowerCase().replace(/^\*\./, '').replace(/\.$/, '');
    const seen = new Set<string>();

    for (const label of labels) {
      if (typeof label !== 'string' || !label.trim()) continue;
      const fqdn = `${label.trim().toLowerCase()}.${apex}`;
      if (seen.has(fqdn)) continue;
      seen.add(fqdn);
      out.assets.push({ type: 'SUBDOMAIN', value: fqdn });
    }

    return out;
  }
}
