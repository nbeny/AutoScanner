import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

/**
 * Parser for theHarvester stdout output.
 * - Extracts email addresses via regex from the full captured stdout.
 * - Lowercases and deduplicates all found addresses.
 * - Pushes each address as { address } to out.emails.
 * - Tolerant: never throws on malformed or empty input.
 */
@Injectable()
export class TheHarvesterTextParser implements Parser {
  readonly name = 'theharvester-text';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');

    if (!text.trim()) return out;

    // Extract emails (lowercased, deduped) from the full stdout.
    // theHarvester output format varies across versions; regex over full text
    // is robust to structural changes.
    const emailRegex = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
    const seen = new Set<string>();
    for (const match of text.matchAll(emailRegex)) {
      const address = match[0].toLowerCase();
      if (!seen.has(address)) {
        seen.add(address);
        out.emails.push({ address });
      }
    }

    return out;
  }
}
