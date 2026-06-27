import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface RawRecord {
  type?: string;
  name?: string;
  address?: string;
  exchange?: string;
  target?: string;
  zone_transfer?: string;
  ns_server?: string;
}

function pushAsset(out: ReturnType<typeof emptyNormalizedOutput>, value: string): void {
  const v = value.trim();
  if (!v) return;
  const isIp = /^\d+\.\d+\.\d+\.\d+$/.test(v) || v.includes(':');
  out.assets.push({ type: isIp ? 'IP' : 'SUBDOMAIN', value: v });
}

@Injectable()
export class DnsreconJsonParser implements Parser {
  readonly name = 'dnsrecon-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    let docs: RawRecord[];
    try {
      const parsed = JSON.parse(text);
      docs = Array.isArray(parsed) ? (parsed as RawRecord[]) : [];
    } catch {
      return out;
    }

    for (const r of docs) {
      if (!r || typeof r !== 'object') continue;
      const type = (r.type ?? '').toUpperCase();
      if (type === 'AXFR') {
        if ((r.zone_transfer ?? '').toLowerCase() === 'success') {
          out.findings.push({
            scannerName: ctx.scannerName,
            title: 'DNS zone transfer (AXFR) exposed',
            severity: 'HIGH',
            location: ctx.target,
            description: `Allowed by NS ${r.ns_server ?? 'unknown'}`,
          });
        }
        continue;
      }
      if (r.name) pushAsset(out, r.name);
      if (r.address) pushAsset(out, r.address);
      if (r.exchange) pushAsset(out, r.exchange);
      if (r.target) pushAsset(out, r.target);
    }
    return out;
  }
}
