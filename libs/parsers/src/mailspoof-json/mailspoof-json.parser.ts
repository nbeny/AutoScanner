import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedFinding, NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface MailspoofPayload {
  domain?: string;
  spf?: { record?: string | null; issues?: string[] };
  dmarc?: { record?: string | null; policy?: string; rua?: string };
  dkim?: { present?: boolean };
}

function pushFinding(
  out: NormalizedOutput,
  ctx: ParserContext,
  domain: string,
  title: string,
  severity: NormalizedFinding['severity'],
): void {
  out.findings.push({ scannerName: ctx.scannerName, title, severity, location: domain });
}

@Injectable()
export class MailspoofJsonParser implements Parser {
  readonly name = 'mailspoof-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    let parsed: MailspoofPayload;
    try {
      parsed = JSON.parse(text) as MailspoofPayload;
    } catch {
      return out;
    }

    out.orgMetadata.push({ kind: 'OTHER', data: parsed });
    const domain = parsed.domain ?? ctx.target;

    // SPF
    if (!parsed.spf?.record) {
      pushFinding(out, ctx, domain, 'MAILSPOOF_SPF_MISSING', 'LOW');
    } else if (
      parsed.spf.issues?.includes('too-permissive') ||
      parsed.spf.record.includes('+all')
    ) {
      pushFinding(out, ctx, domain, 'MAILSPOOF_SPF_PERMISSIVE', 'MEDIUM');
    }

    // DMARC
    if (!parsed.dmarc?.record) {
      pushFinding(out, ctx, domain, 'MAILSPOOF_DMARC_MISSING', 'LOW');
    } else if ((parsed.dmarc.policy ?? '').toLowerCase() === 'none') {
      pushFinding(out, ctx, domain, 'MAILSPOOF_DMARC_NONE', 'MEDIUM');
    }

    // DKIM
    if (parsed.dkim?.present === false) {
      pushFinding(out, ctx, domain, 'MAILSPOOF_DKIM_MISSING', 'LOW');
    }

    return out;
  }
}
