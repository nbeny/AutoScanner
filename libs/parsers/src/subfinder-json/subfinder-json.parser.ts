import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

@Injectable()
export class SubfinderJsonParser implements Parser {
  readonly name = 'subfinder-json';
  readonly formats: RawOutputFormat[] = ['JSONL'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let parsed: { host?: string; source?: string };
      try {
        parsed = JSON.parse(trimmed) as { host?: string; source?: string };
      } catch {
        // Skip malformed JSON lines defensively.
        continue;
      }
      if (!parsed.host) continue;
      out.assets.push({
        type: 'SUBDOMAIN',
        value: parsed.host.toLowerCase().replace(/\.$/, ''),
      });
    }
    return out;
  }
}
