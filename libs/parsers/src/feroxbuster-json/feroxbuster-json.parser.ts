import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface FeroxbusterResponse {
  type?: string;
  url?: string;
  status?: number;
  content_length?: number;
  method?: string;
}

@Injectable()
export class FeroxbusterJsonParser implements Parser {
  readonly name = 'feroxbuster-json';
  readonly formats: RawOutputFormat[] = ['JSONL'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');

    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      let parsed: FeroxbusterResponse;
      try {
        parsed = JSON.parse(line) as FeroxbusterResponse;
      } catch {
        continue;
      }
      if (parsed.type !== 'response' || !parsed.url) continue;
      out.endpoints.push({
        url: parsed.url,
        method: parsed.method ?? 'GET',
        ...(parsed.status !== undefined && { statusCode: parsed.status }),
        ...(parsed.content_length !== undefined && { contentLength: parsed.content_length }),
      });
    }
    return out;
  }
}
