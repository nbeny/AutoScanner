import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext, Severity } from '../types';
import { emptyNormalizedOutput } from '../types';

interface AbuseipdbData {
  ipAddress: string;
  abuseConfidenceScore: number;
  totalReports: number;
  countryCode?: string;
  isp?: string;
  lastReportedAt?: string;
}

@Injectable()
export class AbuseipdbJsonParser implements Parser {
  readonly name = 'abuseipdb-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = Buffer.isBuffer(input) ? input.toString('utf8') : input;
    if (!text.trim()) return out;

    let parsed: { data?: AbuseipdbData };
    try {
      parsed = JSON.parse(text) as { data?: AbuseipdbData };
    } catch {
      return out;
    }

    const data = parsed.data;
    if (!data) return out;

    const score = data.abuseConfidenceScore ?? 0;
    if (score === 0) return out;

    let severity: Severity;
    if (score >= 75) severity = 'HIGH';
    else if (score >= 25) severity = 'MEDIUM';
    else severity = 'INFO';

    out.findings.push({
      scannerName: ctx.scannerName,
      title: `IP ${data.ipAddress} flagged on AbuseIPDB (confidence ${score}%)`,
      severity,
      location: ctx.target,
      description: `${data.totalReports} report(s) in the last 90 days.`,
      evidence: {
        score,
        totalReports: data.totalReports,
        countryCode: data.countryCode,
        isp: data.isp,
        lastReportedAt: data.lastReportedAt,
      },
    });

    return out;
  }
}
