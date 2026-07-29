import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedFinding, NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

const SEVERITIES = new Set(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

function clampSeverity(s: unknown): NormalizedFinding['severity'] {
  return typeof s === 'string' && SEVERITIES.has(s.toUpperCase())
    ? (s.toUpperCase() as NormalizedFinding['severity'])
    : 'INFO';
}

@Injectable()
export class SamlReconJsonParser implements Parser {
  readonly name = 'saml-recon-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    let report: { metadataUrl?: string | null; findings?: unknown[] };
    try {
      report = JSON.parse(text);
    } catch {
      return out;
    }
    if (!report || typeof report !== 'object') return out;
    const location = report.metadataUrl ?? ctx.target;
    for (const f of report.findings ?? []) {
      const item = f as { title?: string; severity?: unknown; detail?: string };
      if (!item.title) continue;
      out.findings.push({
        scannerName: ctx.scannerName,
        title: item.title,
        severity: clampSeverity(item.severity),
        location,
        description: item.detail,
      });
    }
    return out;
  }
}
