import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedFinding, NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface CorsyEntry {
  class?: string;
  acac?: boolean;
  acao?: string;
  description?: string;
}

type Mapping = { title: string; severity: NormalizedFinding['severity'] };

function classify(entry: CorsyEntry): Mapping | null {
  const cls = (entry.class ?? '').toLowerCase();
  if (cls.includes('origin reflected')) {
    return entry.acac === true
      ? { title: 'CORS_WILDCARD_WITH_CREDS', severity: 'CRITICAL' }
      : { title: 'CORS_REFLECT_ANY_ORIGIN', severity: 'HIGH' };
  }
  if (cls.includes('pre-domain bypass')) {
    return { title: 'CORS_PRE_DOMAIN_BYPASS', severity: 'HIGH' };
  }
  if (cls.includes('third-party allowed')) {
    return { title: 'CORS_THIRD_PARTY_ALLOWED', severity: 'MEDIUM' };
  }
  if (cls.includes('http origin allowed')) {
    return { title: 'CORS_HTTP_ALLOWED', severity: 'LOW' };
  }
  return null;
}

@Injectable()
export class CorsyJsonParser implements Parser {
  readonly name = 'corsy-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    let parsed: Record<string, CorsyEntry>;
    try {
      parsed = JSON.parse(text) as Record<string, CorsyEntry>;
    } catch {
      return out;
    }

    for (const [url, entry] of Object.entries(parsed)) {
      if (!entry || typeof entry !== 'object') continue;
      const mapped = classify(entry);
      if (!mapped) continue;
      out.findings.push({
        scannerName: 'corsy',
        title: mapped.title,
        severity: mapped.severity,
        location: url,
        evidence: entry,
        ...(entry.description !== undefined && { description: entry.description }),
      });
    }
    return out;
  }
}
