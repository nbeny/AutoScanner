import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface EvalRow {
  entry_type?: string;
  probe?: string;
  passed?: number;
  total?: number;
}

@Injectable()
export class GarakJsonlParser implements Parser {
  readonly name = 'garak-jsonl';
  readonly formats: RawOutputFormat[] = ['JSONL'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let row: EvalRow;
      try {
        row = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (row.entry_type !== 'eval' || typeof row.probe !== 'string') continue;
      const passed = typeof row.passed === 'number' ? row.passed : 0;
      const total = typeof row.total === 'number' ? row.total : 0;
      if (total <= 0 || passed >= total) continue; // no failures → not a finding
      out.findings.push({
        scannerName: ctx.scannerName,
        title: `LLM probe failed: ${row.probe}`,
        severity: passed === 0 ? 'HIGH' : 'MEDIUM',
        location: ctx.target,
        description: `garak probe ${row.probe} — ${total - passed}/${total} attempts vulnerable.`,
      });
    }
    return out;
  }
}
