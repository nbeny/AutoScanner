import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedIdentity, NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface SocialscanEntry {
  query?: string;
  platform?: string;
  available?: boolean;
  valid?: boolean;
  success?: boolean;
  link?: string;
}

/** Flattens socialscan's `--json` output, which may be a list or a query->list map. */
function collectEntries(parsed: unknown): SocialscanEntry[] {
  if (Array.isArray(parsed)) return parsed as SocialscanEntry[];
  if (parsed && typeof parsed === 'object') {
    const values = Object.values(parsed as Record<string, unknown>);
    return values.flatMap((v) => (Array.isArray(v) ? (v as SocialscanEntry[]) : []));
  }
  return [];
}

/**
 * Parser for socialscan `--json` output. An entry that is `valid` but NOT
 * `available` means an account is registered for that email/username — emitted as
 * an identity. `EMAIL_ACCOUNT` when the seed looks like an email, else `USERNAME`.
 */
@Injectable()
export class SocialscanJsonParser implements Parser {
  readonly name = 'socialscan-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = Buffer.isBuffer(input) ? input.toString('utf8') : input;
    if (!text.trim()) return out;

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return out;
    }

    const seen = new Set<string>();
    for (const e of collectEntries(parsed)) {
      if (!e || typeof e !== 'object') continue;
      const query = (e.query ?? '').trim();
      const platform = (e.platform ?? '').trim();
      if (!query || !platform) continue;
      // Account exists = the handle is taken (valid registration, not available).
      if (e.valid !== true || e.available !== false) continue;
      const key = `${query}|${platform}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const identity: NormalizedIdentity = {
        kind: query.includes('@') ? 'EMAIL_ACCOUNT' : 'USERNAME',
        seed: query,
        service: platform,
        source: 'socialscan',
      };
      if (e.link) identity.url = e.link;
      out.identities.push(identity);
    }
    return out;
  }
}
