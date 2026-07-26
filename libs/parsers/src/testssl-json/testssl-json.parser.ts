import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext, Severity } from '../types';
import { emptyNormalizedOutput } from '../types';

interface TestsslFinding {
  id?: string;
  ip?: string;
  port?: string;
  severity?: string;
  finding?: string;
  cve?: string;
}

const CVE_RE = /CVE-\d{4}-\d+/i;

/** testssl severities we treat as reportable findings; OK/INFO/WARN/DEBUG are dropped. */
function reportableSeverity(value: string | undefined): Severity | null {
  switch ((value ?? '').trim().toUpperCase()) {
    case 'CRITICAL':
      return 'CRITICAL';
    case 'HIGH':
      return 'HIGH';
    case 'MEDIUM':
      return 'MEDIUM';
    case 'LOW':
      return 'LOW';
    default:
      return null;
  }
}

/**
 * Parser for `testssl.sh --jsonfile` output (a flat JSON array of check results).
 * Only LOW+ severities become findings; the first CVE token in the `cve` field is
 * preserved for the CVE-enricher. Tolerant of malformed JSON / empty scans.
 */
@Injectable()
export class TestsslJsonParser implements Parser {
  readonly name = 'testssl-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = Buffer.isBuffer(input) ? input.toString('utf8') : input;
    if (!text.trim()) return out;

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return out;
    }
    if (!Array.isArray(parsed)) return out;

    const seen = new Set<string>();
    for (const f of parsed as TestsslFinding[]) {
      if (!f || typeof f !== 'object') continue;
      const severity = reportableSeverity(f.severity);
      if (!severity) continue;
      const id = (f.id ?? '').trim();
      const finding = (f.finding ?? '').trim();
      const location = [f.ip, f.port].filter(Boolean).join(':') || ctx.target;
      const key = `${id}|${location}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const cveMatch = f.cve?.match(CVE_RE);
      out.findings.push({
        scannerName: ctx.scannerName,
        title: `TLS: ${finding || id}`,
        severity,
        location,
        cveId: cveMatch ? cveMatch[0].toUpperCase() : undefined,
        description: id ? `testssl check: ${id}` : undefined,
      });
    }
    return out;
  }
}
