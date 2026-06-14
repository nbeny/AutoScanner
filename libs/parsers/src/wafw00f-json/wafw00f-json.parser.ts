import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface Wafw00fEntry {
  url?: string;
  detected?: boolean;
  firewall?: string;
  manufacturer?: string;
}

function hostFromUrl(url: string, fallback: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return fallback;
  }
}

@Injectable()
export class Wafw00fJsonParser implements Parser {
  readonly name = 'wafw00f-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return out;
    }
    const entries: Wafw00fEntry[] = Array.isArray(parsed)
      ? (parsed as Wafw00fEntry[])
      : [parsed as Wafw00fEntry];
    for (const entry of entries) {
      if (!entry || entry.detected !== true) continue;
      const firewall = entry.firewall;
      if (!firewall || firewall === 'None' || firewall === 'Generic') continue;
      const assetValue = entry.url ? hostFromUrl(entry.url, ctx.target) : ctx.target;
      out.technologies.push({ assetValue, name: `WAF: ${firewall}`, categories: ['waf'] });
    }
    return out;
  }
}
