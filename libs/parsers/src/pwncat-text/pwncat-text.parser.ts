import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

/**
 * Case-insensitive indicators that the response to the benign probe command
 * looks like an unauthenticated shell / command execution. Any single match is
 * enough to flag a finding.
 */
const SHELL_INDICATORS: RegExp[] = [
  /uid=/i,
  /gid=/i,
  /root@/i,
  /\/bin\/sh/i,
  /\/bin\/bash/i,
  /^\$ /m, // bare shell prompt at start of a line
  /^# /m, // bare root prompt at start of a line
];

const MAX_SNIPPET = 500;

@Injectable()
export class PwncatTextParser implements Parser {
  readonly name = 'pwncat-text';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = Buffer.isBuffer(input) ? input.toString('utf8') : input;
    if (!text.trim()) return out;

    const matched = SHELL_INDICATORS.some((re) => re.test(text));
    if (!matched) return out;

    const snippet = text.trim().slice(0, MAX_SNIPPET);
    out.findings.push({
      scannerName: ctx.scannerName,
      title: 'Possible unauthenticated shell / command execution (pwncat-nc)',
      severity: 'HIGH',
      location: ctx.target,
      description:
        'A benign probe command sent over pwncat-nc returned output resembling command execution ' +
        '(shell prompt or command output). This suggests an exposed, unauthenticated shell or ' +
        'code-execution service. EXPERIMENTAL / best-effort — verify manually before acting.',
      evidence: { snippet },
    });

    return out;
  }
}
