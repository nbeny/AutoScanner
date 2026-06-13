import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface KatanaLine {
  request?: {
    method?: string;
    endpoint?: string;
  };
  response?: {
    status_code?: number;
    content_length?: number;
  };
}

@Injectable()
export class KatanaJsonParser implements Parser {
  readonly name = 'katana-json';
  readonly formats: RawOutputFormat[] = ['JSONL'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');

    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let parsed: KatanaLine;
      try {
        parsed = JSON.parse(trimmed) as KatanaLine;
      } catch {
        // Skip malformed JSON lines defensively.
        continue;
      }

      const url = parsed.request?.endpoint;
      if (!url) continue;

      const method = parsed.request?.method ?? 'GET';
      const statusCode = parsed.response?.status_code;
      const contentLength = parsed.response?.content_length;

      out.endpoints.push({
        url,
        method,
        ...(statusCode !== undefined && { statusCode }),
        ...(contentLength !== undefined && { contentLength }),
      });
    }

    return out;
  }
}
