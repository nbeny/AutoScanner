import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

const LINE_RE = /^(\d+\.\d+\.\d+\.\d+)\s*->\s*\[([\d,]+)\]\s*$/;

/**
 * Parses rustscan `--greppable` output. Each line has the form
 * `<ip> -> [<csv ports>]`. JSON output is upstream-incomplete; greppable
 * is the documented stable contract.
 */
@Injectable()
export class RustscanGreppableParser implements Parser {
  readonly name = 'rustscan-greppable';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    const seenAssets = new Set<string>();
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      const m = line.match(LINE_RE);
      if (!m) continue;
      const ip = m[1];
      if (!seenAssets.has(ip)) {
        seenAssets.add(ip);
        out.assets.push({ type: 'IP', value: ip });
      }
      for (const portStr of m[2].split(',')) {
        const number = Number.parseInt(portStr, 10);
        if (!Number.isFinite(number) || number <= 0 || number > 65535) continue;
        out.ports.push({ assetValue: ip, number, protocol: 'TCP', state: 'OPEN' });
      }
    }
    return out;
  }
}
