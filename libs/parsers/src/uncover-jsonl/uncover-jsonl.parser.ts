import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface UncoverRow {
  ip?: string;
  host?: string;
  port?: number;
  source?: string;
}

/**
 * Parser for `uncover -j` JSONL stdout. One row per (engine, host) tuple.
 * We collapse to one IP asset per unique IP, attaching every distinct
 * hostname seen in the stream.
 */
@Injectable()
export class UncoverJsonlParser implements Parser {
  readonly name = 'uncover-jsonl';
  readonly formats: RawOutputFormat[] = ['JSONL'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    const byIp = new Map<string, Set<string>>();
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      let row: UncoverRow;
      try {
        row = JSON.parse(line) as UncoverRow;
      } catch {
        continue;
      }
      const ip = row.ip?.trim();
      if (!ip) continue;
      const hostnames = byIp.get(ip) ?? new Set<string>();
      if (row.host?.trim()) hostnames.add(row.host.trim().toLowerCase());
      byIp.set(ip, hostnames);
    }

    for (const [ip, hostnames] of byIp) {
      out.assets.push({
        type: 'IP',
        value: ip,
        hostnames: hostnames.size > 0 ? Array.from(hostnames).sort() : undefined,
      });
    }
    return out;
  }
}
