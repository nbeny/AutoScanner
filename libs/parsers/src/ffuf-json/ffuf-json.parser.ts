import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface FfufResult {
  url?: string;
  status?: number;
  length?: number;
}

interface FfufOutput {
  results?: FfufResult[];
}

@Injectable()
export class FfufJsonParser implements Parser {
  readonly name = 'ffuf-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');

    let parsed: FfufOutput;
    try {
      parsed = JSON.parse(text) as FfufOutput;
    } catch {
      return out;
    }

    if (!Array.isArray(parsed.results)) {
      return out;
    }

    for (const r of parsed.results) {
      if (typeof r.url !== 'string') continue;
      out.endpoints.push({
        url: r.url,
        method: 'GET',
        statusCode: r.status,
        contentLength: r.length,
      });
    }

    return out;
  }
}
