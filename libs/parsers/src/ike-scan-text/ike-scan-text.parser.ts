import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

const LINE_RE = /^(\d+\.\d+\.\d+\.\d+)\s+(Main Mode|Aggressive Mode)\s+Handshake returned\s+(.+)$/i;

@Injectable()
export class IkeScanTextParser implements Parser {
  readonly name = 'ike-scan-text';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    const seen = new Set<string>();
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      const m = line.match(LINE_RE);
      if (!m) continue;
      const ip = m[1];
      const mode = m[2];
      const detail = m[3];
      if (!seen.has(ip)) {
        seen.add(ip);
        out.services.push({
          assetValue: ip,
          portNumber: 500,
          protocol: 'UDP',
          name: 'isakmp',
        });
      }

      const isAggressive = /aggressive/i.test(mode);
      const psk = /Auth=PSK/i.test(detail);
      if (isAggressive && psk) {
        out.findings.push({
          scannerName: ctx.scannerName,
          title: 'Aggressive Mode + PSK accepted (offline PSK crack risk)',
          severity: 'MEDIUM',
          location: ip,
          description: detail,
        });
      } else {
        out.findings.push({
          scannerName: ctx.scannerName,
          title: `IKE handshake fingerprint disclosed (${mode})`,
          severity: 'LOW',
          location: ip,
          description: detail,
        });
      }
    }
    return out;
  }
}
