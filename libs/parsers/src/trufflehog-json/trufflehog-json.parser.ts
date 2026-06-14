import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, NormalizedFinding, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface ThRecord {
  DetectorName?: string;
  Verified?: boolean;
  SourceMetadata?: { Data?: { Github?: { repository?: string; file?: string } } };
}

@Injectable()
export class TrufflehogJsonParser implements Parser {
  readonly name = 'trufflehog-json';
  readonly formats: RawOutputFormat[] = ['JSONL'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    const seen = new Set<string>();
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      let rec: ThRecord;
      try {
        rec = JSON.parse(t) as ThRecord;
      } catch {
        continue;
      }
      const detector = rec.DetectorName;
      if (!detector) continue;
      const gh = rec.SourceMetadata?.Data?.Github;
      const repo = gh?.repository ?? 'unknown-repo';
      const file = gh?.file ?? '';
      const location = file ? `${repo}#${file}` : repo;
      const key = `${detector}|${location}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const finding: NormalizedFinding = {
        scannerName: ctx.scannerName,
        title: `Leaked secret: ${detector}`,
        severity: rec.Verified ? 'CRITICAL' : 'HIGH',
        location,
        description: rec.Verified
          ? `trufflehog VERIFIED a live ${detector} secret in public GitHub.`
          : `trufflehog found an unverified ${detector} secret in public GitHub.`,
      };
      out.findings.push(finding);
    }
    return out;
  }
}
