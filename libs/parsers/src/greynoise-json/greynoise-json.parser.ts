import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface GreynoiseResponse {
  ip: string;
  noise: boolean;
  riot: boolean;
  classification?: string;
  name?: string;
  last_seen?: string;
  message?: string;
  error?: string;
}

@Injectable()
export class GreynoiseJsonParser implements Parser {
  readonly name = 'greynoise-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = Buffer.isBuffer(input) ? input.toString('utf8') : input;
    if (!text.trim()) return out;

    let data: GreynoiseResponse;
    try {
      data = JSON.parse(text) as GreynoiseResponse;
    } catch {
      return out;
    }

    if (data.error) return out;
    if (!data.noise && !data.riot) return out;

    const isMalicious = data.classification === 'malicious';

    if (data.noise) {
      out.findings.push({
        scannerName: ctx.scannerName,
        title: isMalicious
          ? `IP ${data.ip} classified as malicious scanner by GreyNoise`
          : `IP ${data.ip} is an active internet scanner (GreyNoise noise)`,
        severity: isMalicious ? 'CRITICAL' : 'MEDIUM',
        location: ctx.target,
        evidence: { classification: data.classification, name: data.name, lastSeen: data.last_seen },
      });
    } else if (data.riot) {
      out.findings.push({
        scannerName: ctx.scannerName,
        title: `IP ${data.ip} is a known benign service (GreyNoise RIOT): ${data.name ?? 'unknown'}`,
        severity: 'INFO',
        location: ctx.target,
        evidence: { name: data.name, lastSeen: data.last_seen },
      });
    }

    return out;
  }
}
