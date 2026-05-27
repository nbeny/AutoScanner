import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface DnsxLine {
  host?: string;
  a?: string[];
  aaaa?: string[];
  cname?: string[];
  mx?: string[];
}

function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, '');
}

@Injectable()
export class DnsxJsonParser implements Parser {
  readonly name = 'dnsx-json';
  readonly formats: RawOutputFormat[] = ['JSONL'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');

    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let parsed: DnsxLine;
      try {
        parsed = JSON.parse(trimmed) as DnsxLine;
      } catch {
        // Skip malformed JSON lines defensively.
        continue;
      }

      if (!parsed.host) continue;
      const host = normalizeHost(parsed.host);
      if (!host) continue;

      // A records: emit IP asset + DnsRecord
      if (Array.isArray(parsed.a)) {
        for (const ip of parsed.a) {
          if (typeof ip !== 'string' || ip.length === 0) continue;
          const normalizedIp = ip.trim().toLowerCase();
          out.assets.push({ type: 'IP', value: normalizedIp });
          out.dnsRecords.push({ assetValue: host, recordType: 'A', value: normalizedIp });
        }
      }

      // AAAA records: emit IP asset + DnsRecord
      if (Array.isArray(parsed.aaaa)) {
        for (const ip of parsed.aaaa) {
          if (typeof ip !== 'string' || ip.length === 0) continue;
          const normalizedIp = ip.trim().toLowerCase();
          out.assets.push({ type: 'IP', value: normalizedIp });
          out.dnsRecords.push({ assetValue: host, recordType: 'AAAA', value: normalizedIp });
        }
      }

      // CNAME records: emit DnsRecord only (no IP asset)
      if (Array.isArray(parsed.cname)) {
        for (const target of parsed.cname) {
          if (typeof target !== 'string' || target.length === 0) continue;
          const normalizedTarget = normalizeHost(target);
          out.dnsRecords.push({ assetValue: host, recordType: 'CNAME', value: normalizedTarget });
        }
      }

      // MX records: emit DnsRecord only (no IP asset)
      if (Array.isArray(parsed.mx)) {
        for (const target of parsed.mx) {
          if (typeof target !== 'string' || target.length === 0) continue;
          const normalizedTarget = normalizeHost(target);
          out.dnsRecords.push({ assetValue: host, recordType: 'MX', value: normalizedTarget });
        }
      }
    }

    return out;
  }
}
