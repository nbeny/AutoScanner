import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedBreachExposure, NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

const PASSWORD_RE = /pass(word)?|hash|credential/i;

/** Splits an h8mail data-class blob ("Passwords, Email addresses") into classes. */
function splitClasses(blob: unknown): string[] {
  if (typeof blob !== 'string') return [];
  return blob
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

@Injectable()
export class H8mailJsonParser implements Parser {
  readonly name = 'h8mail-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    let report: { targets?: unknown[] };
    try {
      report = JSON.parse(text);
    } catch {
      return out;
    }
    if (!report || typeof report !== 'object') return out;

    for (const t of report.targets ?? []) {
      const tgt = t as { target?: string; data?: unknown[] };
      const seed = (tgt.target ?? ctx.target).trim();
      for (const entry of tgt.data ?? []) {
        const row = Array.isArray(entry) ? entry : [entry];
        const breachName = String(row[0] ?? '').trim();
        if (!breachName) continue;
        const dataClasses = splitClasses(row[1]);
        const passwordExposed = dataClasses.some((c) => PASSWORD_RE.test(c));
        const exposure: NormalizedBreachExposure = {
          seed,
          breachName,
          dataClasses,
          passwordExposed,
          severity: passwordExposed ? 'HIGH' : dataClasses.length > 0 ? 'MEDIUM' : 'LOW',
          source: 'H8MAIL',
          raw: row,
        };
        out.breachExposures.push(exposure);
      }
    }
    return out;
  }
}
