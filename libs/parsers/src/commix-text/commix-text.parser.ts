import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

// commix marks a hit with: (!) The (GET) 'id' parameter is vulnerable to ... command injection
const VULN_RE =
  /The\s*\((GET|POST|COOKIE|[A-Z]+)\)\s*'([^']+)'\s*parameter is vulnerable to.*command injection/i;

@Injectable()
export class CommixTextParser implements Parser {
  readonly name = 'commix-text';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = Buffer.isBuffer(input) ? input.toString('utf8') : input;
    if (!text.trim()) return out;

    try {
      const seen = new Set<string>();
      for (const line of text.split('\n')) {
        const m = line.trim().match(VULN_RE);
        if (!m) continue;
        const method = m[1];
        const param = m[2];
        const key = `${param}|${method}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.findings.push({
          scannerName: ctx.scannerName,
          title: `OS command injection (param: ${param}, ${method})`,
          severity: 'CRITICAL',
          location: ctx.target,
          description: `commix confirmed OS command injection in parameter '${param}' via ${method}.`,
        });
      }
    } catch {
      return emptyNormalizedOutput();
    }

    return out;
  }
}
