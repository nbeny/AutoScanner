import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

// Arjun -oJ historically maps url -> string[]; newer builds map url -> { params: string[] }.
type ArjunValue = string[] | { params?: string[] };

function extractParams(value: ArjunValue): string[] {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.params)) return value.params;
  return [];
}

@Injectable()
export class ArjunJsonParser implements Parser {
  readonly name = 'arjun-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');

    let parsed: Record<string, ArjunValue>;
    try {
      parsed = JSON.parse(text) as Record<string, ArjunValue>;
    } catch {
      return out;
    }
    if (!parsed || typeof parsed !== 'object') return out;

    for (const url of Object.keys(parsed)) {
      const params = extractParams(parsed[url]);
      if (params.length === 0) continue;
      out.findings.push({
        scannerName: 'arjun',
        title: `Hidden HTTP parameters discovered (${params.length})`,
        severity: 'INFO',
        location: url,
        evidence: { params },
      });
    }

    return out;
  }
}
