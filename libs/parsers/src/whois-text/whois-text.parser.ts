import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

/**
 * Parser for whois stdout output.
 * - Extracts email addresses via regex, lowercases and dedupes them.
 * - Parses `Key: Value` lines into a record; pushes one WHOIS orgMetadata
 *   entry if any key/value pairs were found.
 * - Tolerant: never throws on malformed or empty input.
 */
@Injectable()
export class WhoisTextParser implements Parser {
  readonly name = 'whois-text';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');

    if (!text.trim()) return out;

    // --- Extract emails (lowercased, deduped) ---
    const emailRegex = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
    const seen = new Set<string>();
    for (const match of text.matchAll(emailRegex)) {
      const address = match[0].toLowerCase();
      if (!seen.has(address)) {
        seen.add(address);
        out.emails.push({ address });
      }
    }

    // --- Parse Key: Value lines into a record ---
    const record: Record<string, string> = {};
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      // Skip blank lines and the >>> footer
      if (!trimmed || trimmed.startsWith('>>>')) continue;
      const colonIdx = trimmed.indexOf(': ');
      if (colonIdx === -1) continue;
      const key = trimmed.slice(0, colonIdx).trim();
      const value = trimmed.slice(colonIdx + 2).trim();
      if (key && value) {
        // Keep first occurrence for duplicate keys (e.g. multiple Name Servers)
        if (!(key in record)) {
          record[key] = value;
        }
      }
    }

    if (Object.keys(record).length > 0) {
      out.orgMetadata.push({ kind: 'WHOIS', data: record });
    }

    return out;
  }
}
