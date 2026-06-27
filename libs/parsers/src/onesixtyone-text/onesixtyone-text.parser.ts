import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

const LINE_RE = /^(\d+\.\d+\.\d+\.\d+)\s+\[([^\]]+)\]\s*(.*)$/;
const DEFAULT_WEAK = new Set([
  'public',
  'private',
  'community',
  'cisco',
  'manager',
  'admin',
  'root',
  'default',
  'snmp',
  'snmpd',
  'write',
  'monitor',
]);

@Injectable()
export class OnesixtyoneTextParser implements Parser {
  readonly name = 'onesixtyone-text';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    for (const raw of text.split('\n')) {
      const line = raw.trim();
      const m = line.match(LINE_RE);
      if (!m) continue;
      const ip = m[1];
      const community = m[2].trim();
      const extra = m[3].trim();

      out.services.push({
        assetValue: ip,
        portNumber: 161,
        protocol: 'UDP',
        name: 'snmp',
        extraInfo: extra || undefined,
      });

      if (DEFAULT_WEAK.has(community.toLowerCase())) {
        out.findings.push({
          scannerName: ctx.scannerName,
          title: `Weak SNMP community accepted: ${community}`,
          severity: 'MEDIUM',
          location: ip,
          description: extra || undefined,
        });
      }
    }
    return out;
  }
}
