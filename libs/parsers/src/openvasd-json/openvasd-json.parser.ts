import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import { cvssToSeverity } from '@autoscanner/cve';
import type {
  NormalizedFinding,
  NormalizedOutput,
  Parser,
  ParserContext,
  Severity,
} from '../types';
import { emptyNormalizedOutput } from '../types';

interface OpenvasdRef {
  type?: string;
  id?: string;
}

interface OpenvasdResult {
  type?: string;
  ip_address?: string;
  hostname?: string;
  oid?: string;
  port?: string;
  message?: string;
  severity?: number;
  refs?: OpenvasdRef[];
}

const CVE_RE = /CVE-\d{4}-\d{4,}/i;

function firstCve(result: OpenvasdResult): string | undefined {
  for (const ref of result.refs ?? []) {
    if (typeof ref?.id === 'string') {
      const m = ref.id.match(CVE_RE);
      if (m) return m[0].toUpperCase();
    }
  }
  const fromMsg = typeof result.message === 'string' ? result.message.match(CVE_RE) : null;
  return fromMsg ? fromMsg[0].toUpperCase() : undefined;
}

@Injectable()
export class OpenvasdJsonParser implements Parser {
  readonly name = 'openvasd-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = Buffer.isBuffer(input) ? input.toString('utf8') : input;
    if (!text.trim()) return out;

    let results: OpenvasdResult[];
    try {
      const parsed: unknown = JSON.parse(text);
      results = Array.isArray(parsed) ? (parsed as OpenvasdResult[]) : [];
    } catch {
      return emptyNormalizedOutput();
    }

    try {
      for (const r of results) {
        if (!r || typeof r !== 'object') continue;
        if (r.type !== 'alarm') continue;
        const severity: Severity = cvssToSeverity(r.severity) ?? 'INFO';
        const host = r.hostname ?? r.ip_address ?? ctx.target;
        const finding: NormalizedFinding = {
          scannerName: ctx.scannerName,
          title: r.message ?? `OpenVAS NVT ${r.oid ?? ''}`.trim(),
          severity,
          location: r.port ? `${host}:${r.port}` : host,
          description: r.oid ? `NVT ${r.oid}` : undefined,
        };
        const cve = firstCve(r);
        if (cve) finding.cveId = cve;
        out.findings.push(finding);
      }
    } catch {
      return emptyNormalizedOutput();
    }

    return out;
  }
}
