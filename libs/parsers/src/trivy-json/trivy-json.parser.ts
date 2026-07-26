import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext, Severity } from '../types';
import { emptyNormalizedOutput } from '../types';

interface TrivyVuln {
  VulnerabilityID?: string;
  PkgName?: string;
  InstalledVersion?: string;
  FixedVersion?: string;
  Severity?: string;
  Title?: string;
  Description?: string;
  PrimaryURL?: string;
}

interface TrivyResult {
  Target?: string;
  Vulnerabilities?: TrivyVuln[] | null;
}

interface TrivyReport {
  ArtifactName?: string;
  Results?: TrivyResult[] | null;
}

const CVE_RE = /^CVE-\d{4}-\d+$/i;

function normalizeSeverity(value: string | undefined): Severity {
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
      return 'INFO';
  }
}

/**
 * Parser for `trivy --format json` output. Every entry in each result's
 * `Vulnerabilities` array becomes a finding, with the CVE id preserved for the
 * CVE-enricher and the affected package/version in the title. Tolerant of null
 * Results (clean scan) and malformed JSON.
 */
@Injectable()
export class TrivyJsonParser implements Parser {
  readonly name = 'trivy-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = Buffer.isBuffer(input) ? input.toString('utf8') : input;
    if (!text.trim()) return out;

    let report: TrivyReport;
    try {
      report = JSON.parse(text) as TrivyReport;
    } catch {
      return out;
    }

    const artifact = report.ArtifactName ?? ctx.target;
    const seen = new Set<string>();
    for (const result of report.Results ?? []) {
      for (const v of result.Vulnerabilities ?? []) {
        const id = (v.VulnerabilityID ?? '').trim();
        if (!id) continue;
        const pkg = v.PkgName ?? '';
        const key = `${id}|${pkg}|${v.InstalledVersion ?? ''}|${result.Target ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const fix = v.FixedVersion ? ` (fixed in ${v.FixedVersion})` : '';
        out.findings.push({
          scannerName: ctx.scannerName,
          title: `${id}: ${pkg} ${v.InstalledVersion ?? ''}`.trim() + fix,
          severity: normalizeSeverity(v.Severity),
          location: `${artifact}${result.Target ? ` › ${result.Target}` : ''}`,
          cveId: CVE_RE.test(id) ? id.toUpperCase() : undefined,
          description: v.Title ?? v.Description ?? v.PrimaryURL,
        });
      }
    }
    return out;
  }
}
