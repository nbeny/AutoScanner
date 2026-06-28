import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

interface EmailfinderPayload {
  domain?: string;
  emails?: string[];
}

@Injectable()
export class EmailfinderJsonParser implements Parser {
  readonly name = 'emailfinder-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    let parsed: EmailfinderPayload;
    try {
      parsed = JSON.parse(text) as EmailfinderPayload;
    } catch {
      return out;
    }

    const seen = new Set<string>();
    for (const raw of parsed.emails ?? []) {
      const address = raw.trim().toLowerCase();
      if (!EMAIL_RE.test(address) || seen.has(address)) continue;
      seen.add(address);
      out.emails.push({ address, source: 'emailfinder' });
    }
    return out;
  }
}
