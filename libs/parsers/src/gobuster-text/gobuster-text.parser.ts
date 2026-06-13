import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

const LINE_RE = /^(\/\S*)\s+\(Status:\s*(\d{3})\)/;

@Injectable()
export class GobusterTextParser implements Parser {
  readonly name = 'gobuster-text';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    // Only treat the target as a ready-made base if it has a real scheme;
    // `startsWith('http')` would mis-classify a domain like `httpfoo.com`.
    const hasScheme = /^https?:\/\//.test(ctx.target);
    const base = hasScheme ? ctx.target : `https://${ctx.target}`;

    for (const line of text.split('\n')) {
      const match = LINE_RE.exec(line.trim());
      if (!match) continue;
      const [, urlPath, code] = match;
      const url = new URL(urlPath, base).href;
      out.endpoints.push({
        url,
        method: 'GET',
        statusCode: Number(code),
      });
    }

    return out;
  }
}
