import { Injectable, Logger } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type {
  NormalizedFinding,
  NormalizedOutput,
  Parser,
  ParserContext,
  Severity,
} from '../types';
import { emptyNormalizedOutput } from '../types';

interface NucleiClassification {
  'cve-id'?: string[];
  cve_id?: string[];
  'cwe-id'?: string[];
  cwe_id?: string[];
}

interface NucleiInfo {
  name?: string;
  severity?: string;
  description?: string;
  tags?: string[];
  classification?: NucleiClassification;
}

interface NucleiLine {
  'template-id'?: string;
  template?: string;
  info?: NucleiInfo;
  type?: string;
  host?: string;
  'matched-at'?: string;
  request?: string;
  response?: string;
  'extracted-results'?: unknown;
  'curl-command'?: string;
  timestamp?: string;
  [key: string]: unknown;
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
    case 'info':
      return 'INFO';
    default:
      // Unknown/missing severity → INFO (least-impact default). Avoids dropping
      // findings purely on a severity-spelling mismatch from upstream templates.
      return 'INFO';
  }
}

function firstCveId(classification: NucleiClassification | undefined): string | undefined {
  if (!classification) return undefined;
  const list = classification['cve-id'] ?? classification.cve_id;
  if (!Array.isArray(list) || list.length === 0) return undefined;
  const first = list[0];
  return typeof first === 'string' && first.length > 0 ? first : undefined;
}

@Injectable()
export class NucleiJsonParser implements Parser {
  private readonly logger = new Logger(NucleiJsonParser.name);
  readonly name = 'nuclei-json';
  readonly formats: RawOutputFormat[] = ['JSONL'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');

    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let parsed: NucleiLine;
      try {
        parsed = JSON.parse(trimmed) as NucleiLine;
      } catch {
        this.logger.warn(`skipping malformed nuclei JSON line: ${trimmed.slice(0, 120)}`);
        continue;
      }

      const info = parsed.info;
      // Anchor: a finding must have a title (info.name) AND a severity. Without
      // either we cannot persist a meaningful Finding row.
      const title = info?.name;
      if (typeof title !== 'string' || title.length === 0) continue;
      if (typeof info?.severity !== 'string' || info.severity.length === 0) continue;

      const templateId =
        typeof parsed['template-id'] === 'string' && parsed['template-id'].length > 0
          ? parsed['template-id']
          : typeof parsed.template === 'string' && parsed.template.length > 0
            ? parsed.template
            : undefined;

      const location =
        typeof parsed['matched-at'] === 'string' && parsed['matched-at'].length > 0
          ? parsed['matched-at']
          : typeof parsed.host === 'string' && parsed.host.length > 0
            ? parsed.host
            : undefined;

      const cveId = firstCveId(info.classification);

      // Evidence: preserve the diagnostic surface that lets a triager reproduce.
      // We attach the request/response and extracted-results when present, plus
      // tags/description for context. Stored as `Json?` in Prisma.
      const evidence: Record<string, unknown> = {};
      if (typeof parsed.request === 'string') evidence['request'] = parsed.request;
      if (typeof parsed.response === 'string') evidence['response'] = parsed.response;
      if (parsed['extracted-results'] !== undefined) {
        evidence['extracted-results'] = parsed['extracted-results'];
      }
      if (typeof parsed['curl-command'] === 'string') {
        evidence['curl-command'] = parsed['curl-command'];
      }
      if (Array.isArray(info.tags) && info.tags.length > 0) evidence['tags'] = info.tags;

      const finding: NormalizedFinding = {
        scannerName: 'nuclei',
        title,
        severity: normalizeSeverity(info.severity),
        location,
        cveId,
        templateId,
        description: typeof info.description === 'string' ? info.description : undefined,
        evidence: Object.keys(evidence).length > 0 ? evidence : undefined,
      };

      out.findings.push(finding);
    }

    return out;
  }
}
