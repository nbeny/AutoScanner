import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext, Severity } from '../types';
import { emptyNormalizedOutput } from '../types';

interface EmailrepRow {
  email?: string;
  reputation?: string;
  details?: {
    credentials_leaked?: boolean;
    data_breach?: boolean;
    suspicious?: boolean;
  };
}

function pushIf(
  cond: boolean,
  out: NormalizedOutput,
  ctx: ParserContext,
  email: string,
  title: string,
  severity: Severity,
): void {
  if (!cond) return;
  out.findings.push({ scannerName: ctx.scannerName, title, severity, location: email });
}

@Injectable()
export class EmailrepJsonlParser implements Parser {
  readonly name = 'emailrep-jsonl';
  readonly formats: RawOutputFormat[] = ['JSONL'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      let parsed: EmailrepRow;
      try {
        parsed = JSON.parse(line) as EmailrepRow;
      } catch {
        continue;
      }
      const email = parsed.email ?? ctx.target;
      const d = parsed.details ?? {};
      pushIf(d.credentials_leaked === true, out, ctx, email, 'EMAILREP_BREACHED', 'HIGH');
      pushIf(d.data_breach === true, out, ctx, email, 'EMAILREP_DATA_BREACH', 'HIGH');
      pushIf(d.suspicious === true, out, ctx, email, 'EMAILREP_SUSPICIOUS', 'MEDIUM');
      pushIf(
        (parsed.reputation ?? '').toLowerCase() === 'low',
        out,
        ctx,
        email,
        'EMAILREP_LOW_REPUTATION',
        'LOW',
      );
    }
    return out;
  }
}
