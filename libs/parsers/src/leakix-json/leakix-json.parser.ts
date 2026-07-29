import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type {
  NormalizedBreachExposure,
  NormalizedOutput,
  Parser,
  ParserContext,
  Severity,
} from '../types';
import { emptyNormalizedOutput } from '../types';

const PASSWORD_RE = /pass(word)?|hash|credential/i;
const VALID_SEVERITIES: Severity[] = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

interface LeakixExposureRow {
  breachName?: unknown;
  dataClasses?: unknown;
  passwordExposed?: unknown;
  severity?: unknown;
  breachDate?: unknown;
}

interface LeakixReport {
  query?: unknown;
  exposures?: unknown;
}

function toDataClasses(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
    .map((c) => c.trim());
}

/** Clamps an arbitrary probe-reported severity to a known `Severity`, falling
 * back to a heuristic derived from the exposure's own signals when the value
 * is missing or unrecognised. */
function clampSeverity(raw: unknown, passwordExposed: boolean, dataClasses: string[]): Severity {
  if (typeof raw === 'string') {
    const upper = raw.toUpperCase();
    if ((VALID_SEVERITIES as string[]).includes(upper)) return upper as Severity;
  }
  return passwordExposed ? 'HIGH' : dataClasses.length > 0 ? 'MEDIUM' : 'LOW';
}

@Injectable()
export class LeakixJsonParser implements Parser {
  readonly name = 'leakix-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    let report: LeakixReport;
    try {
      report = JSON.parse(text);
    } catch {
      return out;
    }
    if (!report || typeof report !== 'object') return out;

    const seed = (typeof report.query === 'string' && report.query.trim()) || ctx.target;
    const exposures = Array.isArray(report.exposures) ? report.exposures : [];

    for (const entry of exposures) {
      const row = entry as LeakixExposureRow;
      const breachName = typeof row.breachName === 'string' ? row.breachName.trim() : '';
      if (!breachName) continue;

      const dataClasses = toDataClasses(row.dataClasses);
      const passwordExposed =
        typeof row.passwordExposed === 'boolean'
          ? row.passwordExposed
          : dataClasses.some((c) => PASSWORD_RE.test(c));
      const severity = clampSeverity(row.severity, passwordExposed, dataClasses);
      const breachDate =
        typeof row.breachDate === 'string' && row.breachDate.trim() ? row.breachDate : undefined;

      const exposure: NormalizedBreachExposure = {
        seed,
        breachName,
        dataClasses,
        passwordExposed,
        severity,
        source: 'LEAKIX',
        raw: row,
        ...(breachDate ? { breachDate } : {}),
      };
      out.breachExposures.push(exposure);
    }
    return out;
  }
}
