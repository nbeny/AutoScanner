import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface DnstwistRow {
  domain?: string;
  fuzzer?: string;
  dns_a?: string[];
  dns_mx?: string[];
}

/**
 * Parser for `dnstwist --format json` output (array of permutation rows). Each
 * row whose fuzzer is not the original and that resolved (dns_a present) yields
 * a DOMAIN asset + a MEDIUM "lookalike/typosquat domain registered" finding.
 */
@Injectable()
export class DnstwistJsonParser implements Parser {
  readonly name = 'dnstwist-json';
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

    for (const row of arr as DnstwistRow[]) {
      const domain = row.domain?.trim().toLowerCase();
      if (!domain) continue;
      if (row.fuzzer === 'original' || row.fuzzer?.startsWith('original')) continue;
      const resolved = (row.dns_a?.length ?? 0) > 0 || (row.dns_mx?.length ?? 0) > 0;
      if (!resolved) continue;

      out.assets.push({ type: 'DOMAIN', value: domain });
      out.findings.push({
        scannerName: ctx.scannerName,
        title: `Lookalike/typosquat domain registered: ${domain}`,
        severity: 'MEDIUM',
        location: domain,
        description: `Permutation (${row.fuzzer ?? 'unknown'}) of ${ctx.target} is registered and resolving.`,
        evidence: row,
      });
    }
    return out;
  }
}
