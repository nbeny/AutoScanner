import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext, Severity } from '../types';
import { emptyNormalizedOutput } from '../types';

interface DalfoxPoc {
  type?: string; // 'V' = verified vuln, 'G' = grep, 'R' = reflected
  severity?: string;
  cwe?: string;
  data?: string; // the PoC URL
  message_str?: string;
  param?: string;
}

function normalizeSeverity(value: string | undefined): Severity {
  switch ((value ?? '').trim().toLowerCase()) {
    case 'critical':
      return 'CRITICAL';
    case 'high':
      return 'HIGH';
    case 'medium':
      return 'MEDIUM';
    case 'low':
      return 'LOW';
    default:
      return 'HIGH';
  }
}

function parsePocs(text: string): DalfoxPoc[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  try {
    const arr = JSON.parse(trimmed) as unknown;
    if (Array.isArray(arr)) return arr as DalfoxPoc[];
  } catch {
    // fall through to JSONL
  }
  const result: DalfoxPoc[] = [];
  for (const line of trimmed.split('\n')) {
    const l = line.trim();
    if (!l.startsWith('{')) continue;
    try {
      result.push(JSON.parse(l) as DalfoxPoc);
    } catch {
      /* skip bad line */
    }
  }
  return result;
}

@Injectable()
export class DalfoxJsonParser implements Parser {
  readonly name = 'dalfox-json';
  readonly formats: RawOutputFormat[] = ['JSON', 'JSONL'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = Buffer.isBuffer(input) ? input.toString('utf8') : input;

    try {
      const seen = new Set<string>();
      for (const poc of parsePocs(text)) {
        if (poc.type !== 'V' && poc.type !== 'R') continue;
        const loc = poc.data ?? ctx.target;
        const key = `${poc.param ?? ''}|${loc}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.findings.push({
          scannerName: ctx.scannerName,
          title: `Reflected/DOM XSS${poc.param ? ` (param: ${poc.param})` : ''}`,
          severity: normalizeSeverity(poc.severity),
          location: loc,
          description: poc.message_str ?? poc.cwe ?? 'XSS PoC confirmed by dalfox',
        });
      }
    } catch {
      return emptyNormalizedOutput();
    }

    return out;
  }
}
