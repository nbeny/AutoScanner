import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

// Matches kiterunner output lines, e.g.:
// GET     200 [  1234,   45,  6] https://api.example.com/api/v1/users 0cf6841b
const LINE_RE = /^(\w+)\s+(\d{3})\s+\[[^\]]*\]\s+(https?:\/\/\S+)/;

@Injectable()
export class KiterunnerTextParser implements Parser {
  readonly name = 'kiterunner-text';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = Buffer.isBuffer(input) ? input.toString('utf8') : input;
    if (!text.trim()) return out;

    try {
      const seenUrls = new Set<string>();

      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const match = LINE_RE.exec(trimmed);
        if (!match) continue;

        const method = match[1];
        const statusCode = Number(match[2]);
        // Strip any trailing hash/id that kiterunner appends after the URL
        const url = match[3].replace(/\s.*$/, '');

        if (seenUrls.has(url)) continue;
        seenUrls.add(url);

        out.endpoints.push({ url, method, statusCode });
      }
    } catch {
      return emptyNormalizedOutput();
    }

    return out;
  }
}
