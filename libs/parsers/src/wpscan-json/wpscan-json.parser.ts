import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type {
  NormalizedFinding,
  NormalizedOutput,
  Parser,
  ParserContext,
  Severity,
} from '../types';
import { emptyNormalizedOutput } from '../types';

interface WpVersion {
  number?: string | null;
}
interface WpComponent {
  slug?: string;
  version?: WpVersion;
}
interface WpInterestingFinding {
  url?: string;
  type?: string;
  to_s?: string;
}
interface WpscanReport {
  version?: WpVersion;
  main_theme?: WpComponent;
  plugins?: Record<string, WpComponent>;
  themes?: Record<string, WpComponent>;
  interesting_findings?: WpInterestingFinding[];
  users?: Record<string, unknown>;
}

const MEDIUM_FINDING_TYPES = new Set(['debug_log', 'backup_db', 'backup_file', 'config_backup']);

@Injectable()
export class WpscanJsonParser implements Parser {
  readonly name = 'wpscan-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');

    let report: WpscanReport;
    try {
      report = JSON.parse(text) as WpscanReport;
    } catch {
      return out;
    }
    if (!report || typeof report !== 'object') return out;

    const asset = ctx.target;

    const pushTech = (name: string, version?: string | null): void => {
      out.technologies.push({
        assetValue: asset,
        name,
        ...(version ? { version } : {}),
      });
    };

    if (report.version?.number) pushTech('WordPress', report.version.number);
    if (report.main_theme?.slug)
      pushTech(report.main_theme.slug, report.main_theme.version?.number);

    for (const group of [report.plugins, report.themes]) {
      if (!group) continue;
      for (const key of Object.keys(group)) {
        const comp = group[key];
        pushTech(comp.slug ?? key, comp.version?.number);
      }
    }

    for (const finding of report.interesting_findings ?? []) {
      const severity: Severity = MEDIUM_FINDING_TYPES.has(finding.type ?? '') ? 'MEDIUM' : 'INFO';
      const entry: NormalizedFinding = {
        scannerName: 'wpscan',
        title: finding.to_s ?? finding.type ?? 'WPScan interesting finding',
        severity,
        location: finding.url,
        evidence: finding,
      };
      out.findings.push(entry);
    }

    for (const user of Object.keys(report.users ?? {})) {
      out.findings.push({
        scannerName: 'wpscan',
        title: `WordPress user enumerated: ${user}`,
        severity: 'LOW',
        location: asset,
        evidence: { user },
      });
    }

    return out;
  }
}
