import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface HttpxRecord {
  host?: string;
  input?: string;
  url?: string;
  favicon?: string;
}

function hostOf(rec: HttpxRecord, fallback: string): string {
  return (rec.host ?? rec.input ?? rec.url ?? fallback).toLowerCase();
}

@Injectable()
export class FaviconJsonParser implements Parser {
  readonly name = 'favicon-json';
  readonly formats: RawOutputFormat[] = ['JSONL'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;
    const seen = new Set<string>();
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      let rec: HttpxRecord;
      try {
        rec = JSON.parse(t) as HttpxRecord;
      } catch {
        continue;
      }
      const fav = typeof rec.favicon === 'string' ? rec.favicon.trim() : '';
      if (!fav || fav === '0') continue;
      const host = hostOf(rec, ctx.target);
      const key = `${host}|${fav}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.technologies.push({
        assetValue: host,
        name: `favicon-hash:${fav}`,
        categories: ['favicon'],
      });
    }
    return out;
  }
}
