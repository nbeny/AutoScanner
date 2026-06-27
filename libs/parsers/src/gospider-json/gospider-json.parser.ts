import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface GospiderLine {
  output_type?: string;
  output?: string;
  status?: string | number;
  length?: number;
}

@Injectable()
export class GospiderJsonParser implements Parser {
  readonly name = 'gospider-json';
  readonly formats: RawOutputFormat[] = ['JSONL'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');

    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      let parsed: GospiderLine;
      try {
        parsed = JSON.parse(line) as GospiderLine;
      } catch {
        continue;
      }
      const value = parsed.output;
      if (!value) continue;

      switch (parsed.output_type) {
        case 'href':
        case 'url':
        case 'linkfinder': {
          const status = typeof parsed.status === 'string' ? Number(parsed.status) : parsed.status;
          out.endpoints.push({
            url: value,
            method: 'GET',
            ...(Number.isFinite(status) && { statusCode: status as number }),
            ...(parsed.length !== undefined && { contentLength: parsed.length }),
          });
          break;
        }
        case 'subdomain': {
          out.assets.push({ type: 'SUBDOMAIN', value });
          break;
        }
        default:
          break;
      }
    }
    return out;
  }
}
