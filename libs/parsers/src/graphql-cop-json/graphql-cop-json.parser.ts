import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedFinding, NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface GraphqlCopEntry {
  title?: string;
  impact?: string;
  curl_verify?: string;
}

const TITLE_MAP: Array<{ match: RegExp; title: string; severity: NormalizedFinding['severity'] }> =
  [
    { match: /mutation.*over.*get/i, title: 'GRAPHQL_COP_MUTATION_OVER_GET', severity: 'HIGH' },
    { match: /alias.*overloading/i, title: 'GRAPHQL_COP_ALIAS_OVERLOADING', severity: 'HIGH' },
    { match: /introspection/i, title: 'GRAPHQL_COP_INTROSPECTION_ENABLED', severity: 'MEDIUM' },
    { match: /batching/i, title: 'GRAPHQL_COP_BATCHING_ENABLED', severity: 'MEDIUM' },
    {
      match: /directive.*overloading/i,
      title: 'GRAPHQL_COP_DIRECTIVE_OVERLOADING',
      severity: 'MEDIUM',
    },
    { match: /field.*suggestion/i, title: 'GRAPHQL_COP_FIELD_SUGGESTIONS', severity: 'LOW' },
  ];

function classify(
  title: string,
): { title: string; severity: NormalizedFinding['severity'] } | null {
  for (const rule of TITLE_MAP) {
    if (rule.match.test(title)) return { title: rule.title, severity: rule.severity };
  }
  return null;
}

@Injectable()
export class GraphqlCopJsonParser implements Parser {
  readonly name = 'graphql-cop-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    let parsed: GraphqlCopEntry[];
    try {
      parsed = JSON.parse(text) as GraphqlCopEntry[];
    } catch {
      return out;
    }
    if (!Array.isArray(parsed)) return out;

    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object' || !entry.title) continue;
      const mapped = classify(entry.title);
      if (!mapped) continue;
      out.findings.push({
        scannerName: 'graphql-cop',
        title: mapped.title,
        severity: mapped.severity,
        location: ctx.target,
        evidence: { upstreamTitle: entry.title, curl: entry.curl_verify },
      });
    }
    return out;
  }
}
