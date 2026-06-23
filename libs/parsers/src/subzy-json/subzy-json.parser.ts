import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface SubzyResult {
  Subdomain?: string;
  subdomain?: string;
  Engine?: string;
  engine?: string;
  Vulnerable?: boolean;
  vulnerable?: boolean;
}

/**
 * Parser for subzy's `--output` JSON (an array of per-subdomain results).
 * Each vulnerable entry becomes a HIGH "subdomain takeover" finding. subzy is
 * run with `--hide_fails`, so non-vulnerable entries are normally absent; we
 * still guard on the Vulnerable flag defensively. Key casing varies across
 * subzy versions, so both Capitalised and lowercase keys are accepted.
 */
@Injectable()
export class SubzyJsonParser implements Parser {
  readonly name = 'subzy-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    let arr: unknown;
    try {
      arr = JSON.parse(text);
    } catch {
      return out;
    }
    if (!Array.isArray(arr)) return out;

    for (const item of arr as SubzyResult[]) {
      const sub = item.Subdomain ?? item.subdomain;
      const engine = item.Engine ?? item.engine ?? 'unknown service';
      const vulnerable = item.Vulnerable ?? item.vulnerable ?? false;
      if (!sub || !vulnerable) continue;
      out.findings.push({
        scannerName: ctx.scannerName,
        title: `Subdomain takeover: ${sub} (${engine})`,
        severity: 'HIGH',
        location: sub,
        description: `Dangling resource detected — ${sub} points at an unclaimed ${engine} resource and may be claimable by an attacker.`,
        evidence: item,
      });
    }
    return out;
  }
}
