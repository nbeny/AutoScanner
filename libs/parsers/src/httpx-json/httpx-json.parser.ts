import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface HttpxLine {
  input?: string;
  url?: string;
  host?: string;
  status_code?: number;
  title?: string;
  webserver?: string;
  tech?: string[];
}

function canonicalizeHost(value: string): string {
  return value.toLowerCase().replace(/\.$/, '');
}

@Injectable()
export class HttpxJsonParser implements Parser {
  readonly name = 'httpx-json';
  readonly formats: RawOutputFormat[] = ['JSONL'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');

    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let parsed: HttpxLine;
      try {
        parsed = JSON.parse(trimmed) as HttpxLine;
      } catch {
        // Skip malformed JSON lines defensively.
        continue;
      }

      // `input` is the bare host we piped in; `url` includes scheme/port and
      // is therefore not the right canonical asset value.
      const rawInput = parsed.input;
      if (!rawInput || rawInput.length === 0) continue;
      const host = canonicalizeHost(rawInput);
      if (!host) continue;

      out.assets.push({ type: 'SUBDOMAIN', value: host });

      // HTTP probe (carry status/title/server to the persister).
      if (
        parsed.status_code !== undefined ||
        parsed.title !== undefined ||
        parsed.webserver !== undefined
      ) {
        out.httpProbes.push({
          assetValue: host,
          status: parsed.status_code,
          title: parsed.title,
          server: parsed.webserver,
        });
      }

      // Technologies: one entry per `tech[]` item (no version in this mode).
      if (Array.isArray(parsed.tech)) {
        for (const techName of parsed.tech) {
          if (typeof techName !== 'string' || techName.length === 0) continue;
          out.technologies.push({ assetValue: host, name: techName });
        }
      }
    }

    return out;
  }
}
