import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedFinding, NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;

interface Rule {
  test: RegExp;
  title: string;
  severity: NormalizedFinding['severity'];
}

const RULES: Rule[] = [
  {
    test: /CORRECT key!|Cracked|found key/i,
    title: 'JWT signed with weak/known secret',
    severity: 'CRITICAL',
  },
  {
    test: /alg\s*[:=]\s*"?none"?|"alg"\s*:\s*"none"/i,
    title: 'JWT accepts alg:none (unsigned token)',
    severity: 'HIGH',
  },
  {
    test: /key confusion|RSA\/HMAC|HMAC\/RSA/i,
    title: 'JWT RSA/HMAC key confusion',
    severity: 'HIGH',
  },
];

@Injectable()
export class JwtToolTextParser implements Parser {
  readonly name = 'jwt-tool-text';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = (typeof input === 'string' ? input : input.toString('utf8')).replace(ANSI_RE, '');
    if (!text.trim() || text.includes('NO_TOKEN')) return out;

    const seen = new Set<string>();
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      for (const rule of RULES) {
        if (!rule.test.test(line) || seen.has(rule.title)) continue;
        seen.add(rule.title);
        out.findings.push({
          scannerName: ctx.scannerName,
          title: rule.title,
          severity: rule.severity,
          location: ctx.target,
          description: line,
        });
      }
    }
    return out;
  }
}
