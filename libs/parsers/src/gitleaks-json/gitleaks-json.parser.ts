import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface GitleaksRow {
  RuleID?: string;
  Description?: string;
  File?: string;
  StartLine?: number;
  Commit?: string;
  Secret?: string;
  Match?: string;
}

const REDACTED_KEYS = new Set(['Secret', 'Match']);

/**
 * Parser for `gitleaks detect --report-format json`. Each row becomes one
 * HIGH-severity Finding with SECRET-bearing fields scrubbed before persisting.
 * Defence-in-depth: even if a downstream consumer logs evidence, the actual
 * leaked value never propagates beyond the scanner container.
 */
@Injectable()
export class GitleaksJsonParser implements Parser {
  readonly name = 'gitleaks-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
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

    for (const row of arr as GitleaksRow[]) {
      const desc = row.Description?.trim() || row.RuleID?.trim();
      if (!desc) continue;
      const file = row.File?.trim() ?? 'unknown';
      const line = row.StartLine ?? 0;
      const evidence: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        evidence[k] = REDACTED_KEYS.has(k) ? 'REDACTED' : v;
      }
      out.findings.push({
        scannerName: 'gitleaks',
        title: `Secret leak (${desc})`,
        severity: 'HIGH',
        location: line > 0 ? `${file}:${line}` : file,
        description:
          `gitleaks matched rule "${row.RuleID ?? 'unknown'}" in ${file} at line ${line}. ` +
          'Raw secret redacted in evidence.',
        evidence,
      });
    }
    return out;
  }
}
