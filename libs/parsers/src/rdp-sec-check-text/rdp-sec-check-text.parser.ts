import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

const NLA_NOT_ENFORCED_RE = /NLA\s+is\s+NOT\s+enforced/i;
const NLA_DISABLED_RE = /NLA:\s*NO\b/i;
const ENCRYPTION_LEVEL_RE = /Encryption\s+[Ll]evel[:\s]+(\w+)/;
const CLASSIC_RDP_RE = /ClassicRDP\s*\(no\s*NLA\)[:\s]*YES/i;

@Injectable()
export class RdpSecCheckTextParser implements Parser {
  readonly name = 'rdp-sec-check-text';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = Buffer.isBuffer(input) ? input.toString('utf8') : input;
    if (!text.trim()) return out;

    const nlaNotEnforced = NLA_NOT_ENFORCED_RE.test(text) || NLA_DISABLED_RE.test(text);
    if (nlaNotEnforced) {
      out.findings.push({
        scannerName: ctx.scannerName,
        title: 'RDP: NLA (Network Level Authentication) is not enforced',
        severity: 'HIGH',
        location: ctx.target,
        description: 'Connections are accepted without pre-authentication, exposing the login screen to unauthenticated users and brute-force attacks.',
      });
    }

    if (CLASSIC_RDP_RE.test(text)) {
      out.findings.push({
        scannerName: ctx.scannerName,
        title: 'RDP: Classic RDP encryption in use (no NLA)',
        severity: 'MEDIUM',
        location: ctx.target,
      });
    }

    const encMatch = ENCRYPTION_LEVEL_RE.exec(text);
    if (encMatch) {
      const level = encMatch[1].toUpperCase();
      if (level === 'MEDIUM' || level === 'LOW' || level === 'NONE') {
        out.findings.push({
          scannerName: ctx.scannerName,
          title: `RDP: Weak encryption level (${level})`,
          severity: level === 'NONE' ? 'HIGH' : 'MEDIUM',
          location: ctx.target,
          evidence: { encryptionLevel: level },
        });
      }
    }

    return out;
  }
}
