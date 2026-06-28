import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedFinding, NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface SpoofyPayload {
  domain?: string;
  verdict?: string;
}

function classify(
  verdict: string,
): { title: string; severity: NormalizedFinding['severity'] } | null {
  const v = verdict.toLowerCase();
  if (v.includes('spoofable via spf')) {
    return { title: 'SPOOFY_SPF_SPOOFABLE', severity: 'MEDIUM' };
  }
  if (v.includes('spoofable via dmarc')) {
    return { title: 'SPOOFY_DMARC_SPOOFABLE', severity: 'MEDIUM' };
  }
  if (v.includes('not spoofable')) {
    return null;
  }
  if (v.includes('spoofable')) {
    return { title: 'SPOOFY_SPOOFABLE', severity: 'HIGH' };
  }
  return null;
}

@Injectable()
export class SpoofyJsonParser implements Parser {
  readonly name = 'spoofy-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    let parsed: SpoofyPayload;
    try {
      parsed = JSON.parse(text) as SpoofyPayload;
    } catch {
      return out;
    }

    if (!parsed.verdict) return out;
    const mapped = classify(parsed.verdict);
    if (!mapped) return out;

    out.findings.push({
      scannerName: ctx.scannerName,
      title: mapped.title,
      severity: mapped.severity,
      location: parsed.domain ?? ctx.target,
      evidence: { verdict: parsed.verdict },
    });
    return out;
  }
}
