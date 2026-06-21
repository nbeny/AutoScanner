import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

type AlgoEntry = { algorithm: string; keysize?: number; notes?: { fail?: string[]; warn?: string[] } };

@Injectable()
export class SshAuditJsonParser implements Parser {
  readonly name = 'ssh-audit-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = Buffer.isBuffer(input) ? input.toString('utf8') : input;
    if (!text.trim()) return out;

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return out;
    }

    // Banner exposure — always emit INFO if banner is present
    const banner = data['banner'] as { raw?: string; software?: string } | undefined;
    if (banner?.raw) {
      out.findings.push({
        scannerName: ctx.scannerName,
        title: `SSH banner exposed: ${banner.raw}`,
        severity: 'INFO',
        location: ctx.target,
        evidence: { banner: banner.raw },
      });
    }

    // Check kex, key, enc, mac sections for fail/warn entries
    const sections = ['kex', 'key', 'enc', 'mac'] as const;
    for (const section of sections) {
      const entries = data[section] as AlgoEntry[] | undefined;
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        const fails = entry.notes?.fail ?? [];
        const warns = entry.notes?.warn ?? [];
        for (const reason of fails) {
          out.findings.push({
            scannerName: ctx.scannerName,
            title: `Weak SSH algorithm (${section}): ${entry.algorithm}`,
            severity: 'HIGH',
            location: ctx.target,
            description: reason,
            evidence: { section, algorithm: entry.algorithm, keysize: entry.keysize },
          });
        }
        for (const reason of warns) {
          out.findings.push({
            scannerName: ctx.scannerName,
            title: `SSH algorithm warning (${section}): ${entry.algorithm}`,
            severity: 'MEDIUM',
            location: ctx.target,
            description: reason,
            evidence: { section, algorithm: entry.algorithm, keysize: entry.keysize },
          });
        }
      }
    }

    return out;
  }
}
