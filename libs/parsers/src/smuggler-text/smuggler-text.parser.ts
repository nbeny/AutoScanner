import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;
// smuggler announces a desync with the class name and/or an "Issue Found" banner.
const DESYNC_RE = /(CL\.TE|TE\.CL|TE\.TE|potentially vulnerable|issue found)/i;
const CLASS_RE = /(CL\.TE|TE\.CL|TE\.TE)/i;

/**
 * Parser for smuggler stdout. A line naming a desync class (CL.TE / TE.CL / TE.TE)
 * or an "Issue Found" banner becomes a HIGH HTTP-request-smuggling finding. One
 * finding per distinct desync class.
 */
@Injectable()
export class SmugglerTextParser implements Parser {
  readonly name = 'smuggler-text';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    const seen = new Set<string>();
    for (const raw of text.split('\n')) {
      const line = raw.replace(ANSI_RE, '').trim();
      if (!line || !DESYNC_RE.test(line)) continue;
      const cls = line.match(CLASS_RE)?.[0].toUpperCase() ?? 'DESYNC';
      if (seen.has(cls)) continue;
      seen.add(cls);
      out.findings.push({
        scannerName: ctx.scannerName,
        title: `HTTP request smuggling (${cls})`,
        severity: 'HIGH',
        location: ctx.target,
        description: line,
      });
    }
    return out;
  }
}
