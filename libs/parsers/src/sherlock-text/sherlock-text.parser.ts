import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

const SEED_RE = /^##\s*SEED\s+(.+)$/;
// sherlock --print-found emits `[+] <Site>: <url>` for each hit.
const FOUND_RE = /^\[\+\]\s*([^:]+):\s*(\S+)/;

/**
 * Parser for sherlock `--print-found` stdout. Lines `## SEED <value>` (emitted by
 * the scanner's build script) set the current seed; `[+] <Site>: <url>` lines
 * become USERNAME identities. Tolerant of blank / unrecognised lines.
 */
@Injectable()
export class SherlockTextParser implements Parser {
  readonly name = 'sherlock-text';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    let seed = '';
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      const seedMatch = line.match(SEED_RE);
      if (seedMatch) {
        seed = seedMatch[1].trim();
        continue;
      }
      const found = line.match(FOUND_RE);
      if (found && seed) {
        out.identities.push({
          kind: 'USERNAME',
          seed,
          service: found[1].trim(),
          url: found[2].trim(),
          source: 'sherlock',
        });
      }
    }
    return out;
  }
}
