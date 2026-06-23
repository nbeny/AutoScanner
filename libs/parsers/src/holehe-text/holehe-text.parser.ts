import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

const SEED_RE = /^##\s*SEED\s+(.+)$/;
// holehe services are always domains (contain a dot), so requiring a dot in the
// captured token excludes holehe's `[+] Email used` legend line.
const USED_RE = /^\[\+\]\s*(\S+\.\S+)/;

/**
 * Parser for holehe stdout. `## SEED <email>` markers (emitted by the scanner's
 * build script) set the current seed; only `[+] <service>` lines (confirmed
 * accounts, where <service> is a domain) become EMAIL_ACCOUNT identities.
 * `[-]` (not used), `[x]` (rate-limited), and the `[+] Email used` legend line
 * are ignored.
 */
@Injectable()
export class HoleheTextParser implements Parser {
  readonly name = 'holehe-text';
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
      const used = line.match(USED_RE);
      if (used && seed) {
        out.identities.push({
          kind: 'EMAIL_ACCOUNT',
          seed,
          service: used[1].trim(),
          source: 'holehe',
        });
      }
    }
    return out;
  }
}
