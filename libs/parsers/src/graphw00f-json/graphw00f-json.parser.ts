import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface Graphw00fResult {
  detected?: boolean;
  url?: string;
  engine?: { name?: string; version?: string };
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

@Injectable()
export class Graphw00fJsonParser implements Parser {
  readonly name = 'graphw00f-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    let parsed: Graphw00fResult;
    try {
      parsed = JSON.parse(text) as Graphw00fResult;
    } catch {
      return out;
    }
    if (!parsed.detected || !parsed.url) return out;

    out.endpoints.push({ url: parsed.url });

    const engineName = parsed.engine?.name;
    if (engineName) {
      const host = hostOf(parsed.url) ?? hostOf(ctx.target) ?? ctx.target;
      out.technologies.push({
        assetValue: host,
        name: engineName,
        ...(parsed.engine?.version ? { version: parsed.engine.version } : {}),
        categories: ['GraphQL Engine'],
      });
    }
    return out;
  }
}
