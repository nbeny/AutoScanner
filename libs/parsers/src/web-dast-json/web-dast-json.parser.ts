import { Injectable, Logger } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext, Severity } from '../types';
import { emptyNormalizedOutput } from '../types';

const CLASS_KEYWORDS: ReadonlyArray<[RegExp, string]> = [
  [/ssrf/i, 'ssrf'],
  [/(lfi|path[- ]?traversal|file[- ]?inclusion)/i, 'lfi'],
  [/xxe|xml[- ]?external/i, 'xxe'],
  [/open[- ]?redirect/i, 'open-redirect'],
  [/ssti|template[- ]?injection/i, 'ssti'],
  [/sqli|sql[- ]?injection/i, 'sqli'],
  [/(cmd|command|rce)/i, 'cmdi'],
];

function severity(v: string | undefined): Severity {
  switch ((v ?? '').toLowerCase()) {
    case 'critical':
      return 'CRITICAL';
    case 'high':
      return 'HIGH';
    case 'medium':
      return 'MEDIUM';
    case 'low':
      return 'LOW';
    default:
      return 'INFO';
  }
}

function classify(
  templateId: string | undefined,
  tags: string[] | undefined,
  title: string,
): string {
  const hay = [templateId ?? '', (tags ?? []).join(' '), title].join(' ');
  for (const [re, cls] of CLASS_KEYWORDS) if (re.test(hay)) return cls;
  return 'other';
}

@Injectable()
export class WebDastJsonParser implements Parser {
  private readonly logger = new Logger(WebDastJsonParser.name);
  readonly name = 'web-dast-json';
  readonly formats: RawOutputFormat[] = ['JSONL'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');

    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        this.logger.warn(`skipping malformed web-dast JSON line: ${trimmed.slice(0, 120)}`);
        continue;
      }

      const info = (parsed['info'] ?? {}) as {
        name?: string;
        severity?: string;
        tags?: string[];
        description?: string;
      };
      const title = info.name;
      if (typeof title !== 'string' || !title) continue;

      const templateId =
        (typeof parsed['template-id'] === 'string' && (parsed['template-id'] as string)) ||
        (typeof parsed['template'] === 'string' && (parsed['template'] as string)) ||
        undefined;
      const location =
        (typeof parsed['matched-at'] === 'string' && (parsed['matched-at'] as string)) ||
        (typeof parsed['host'] === 'string' && (parsed['host'] as string)) ||
        undefined;

      const injectionClass = classify(templateId || undefined, info.tags, title);
      const oastConfirmed =
        parsed['interactsh-protocol'] !== undefined || /interactsh|oast/i.test(templateId || '');

      out.findings.push({
        scannerName: ctx.scannerName,
        title,
        severity: severity(info.severity),
        location: location || undefined,
        templateId: templateId || undefined,
        description: typeof info.description === 'string' ? info.description : undefined,
        evidence: {
          injectionClass,
          oastConfirmed,
          ...(typeof parsed['request'] === 'string' ? { request: parsed['request'] } : {}),
          ...(typeof parsed['response'] === 'string' ? { response: parsed['response'] } : {}),
        },
      });
    }
    return out;
  }
}
