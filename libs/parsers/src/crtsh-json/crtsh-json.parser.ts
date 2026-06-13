import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface CrtshRecord {
  name_value?: string;
  common_name?: string;
}

function normalizeNames(raw: string): string[] {
  return raw
    .split('\n')
    .map((n) => n.trim().toLowerCase().replace(/^\*\./, '').replace(/\.$/, ''))
    .filter((n) => n.length > 0);
}

@Injectable()
export class CrtshJsonParser implements Parser {
  readonly name = 'crtsh-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return out;
    }

    if (!Array.isArray(parsed)) {
      return out;
    }

    const seen = new Set<string>();

    for (const record of parsed as CrtshRecord[]) {
      const candidates: string[] = [];

      if (typeof record.name_value === 'string') {
        candidates.push(...normalizeNames(record.name_value));
      }
      if (typeof record.common_name === 'string') {
        candidates.push(...normalizeNames(record.common_name));
      }

      for (const value of candidates) {
        if (!value || seen.has(value)) continue;
        seen.add(value);
        out.assets.push({ type: 'SUBDOMAIN', value });
      }
    }

    return out;
  }
}
