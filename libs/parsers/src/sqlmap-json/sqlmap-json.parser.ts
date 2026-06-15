import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

// sqlmap stdout marks each injectable parameter with a 'Parameter: <name> (<METHOD>)' line.
const PARAM_RE = /^Parameter:\s*(.+?)\s*\((GET|POST|COOKIE|URI|[A-Z]+)\)/;

@Injectable()
export class SqlmapJsonParser implements Parser {
  readonly name = 'sqlmap-json';
  readonly formats: RawOutputFormat[] = ['TEXT', 'JSON'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = Buffer.isBuffer(input) ? input.toString('utf8') : input;
    if (!text.trim()) return out;

    try {
      const seen = new Set<string>();
      for (const line of text.split('\n')) {
        const m = line.trim().match(PARAM_RE);
        if (!m) continue;
        const param = m[1];
        const method = m[2];
        const key = `${param}|${method}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.findings.push({
          scannerName: ctx.scannerName,
          title: `SQL injection (param: ${param}, ${method})`,
          severity: 'HIGH',
          location: ctx.target,
          description: `sqlmap confirmed an injectable parameter '${param}' via ${method}.`,
        });
      }
    } catch {
      return emptyNormalizedOutput();
    }

    return out;
  }
}
