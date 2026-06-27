import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

const ABSOLUTE_URL = /^https?:\/\/\S+$/;
const PATH_ONLY = /^\/[A-Za-z0-9._~!$&'()*+,;=:@/%-]+$/;

function resolveUrl(line: string, baseTarget: string): string | null {
  if (ABSOLUTE_URL.test(line)) return line;
  if (PATH_ONLY.test(line)) {
    try {
      const base = new URL(baseTarget);
      return `${base.protocol}//${base.host}${line}`;
    } catch {
      return null;
    }
  }
  return null;
}

@Injectable()
export class LinkfinderTextParser implements Parser {
  readonly name = 'linkfinder-text';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    const seen = new Set<string>();

    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      const url = resolveUrl(line, ctx.target);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      out.endpoints.push({ url });
    }
    return out;
  }
}
