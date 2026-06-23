import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface WaMatch {
  app_name?: string;
  version?: string;
  categories?: string[];
}
interface WaResult {
  hostname?: string;
  matches?: WaMatch[];
}

/** Strip scheme + path, keep host, so the techno links to the SUBDOMAIN/host asset value. */
function hostOf(raw: string, fallback: string): string {
  const v = raw.trim();
  if (!v) return fallback;
  try {
    return new URL(v.includes('://') ? v : `https://${v}`).hostname || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Parser for `webanalyze -output json`. webanalyze prints one JSON object
 * ({ hostname, matches[] }) — or, with multiple hosts, several. We accept a
 * single object or an array. Each match becomes a NormalizedTechnology.
 */
@Injectable()
export class WebanalyzeJsonParser implements Parser {
  readonly name = 'webanalyze-json';
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
    const results: WaResult[] = Array.isArray(parsed)
      ? (parsed as WaResult[])
      : [parsed as WaResult];

    for (const res of results) {
      if (!res || typeof res !== 'object') continue;
      const host = hostOf(res.hostname ?? '', ctx.target);
      for (const m of res.matches ?? []) {
        if (!m.app_name) continue;
        out.technologies.push({
          assetValue: host,
          name: m.app_name,
          version: m.version ? m.version : undefined,
          categories: m.categories,
        });
      }
    }
    return out;
  }
}
