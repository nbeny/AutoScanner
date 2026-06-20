import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

const VALID_USER_RE = /VALID USERNAME:\s+(\S+)/;
const NO_PREAUTH_RE = /\[\+\]\s+(\S+)\s+has no pre auth required/i;
const ASREP_HASH_RE = /^\$krb5asrep\$/;

@Injectable()
export class KerbruteTextParser implements Parser {
  readonly name = 'kerbrute-text';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = Buffer.isBuffer(input) ? input.toString('utf8') : input;
    if (!text.trim()) return out;

    let pendingAsrepUser: string | undefined;

    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const valid = trimmed.match(VALID_USER_RE);
      if (valid) {
        out.findings.push({
          scannerName: 'kerbrute',
          title: `Valid AD account: ${valid[1]}`,
          severity: 'LOW',
          location: ctx.target,
          evidence: { username: valid[1] },
        });
        continue;
      }

      const noPreauth = trimmed.match(NO_PREAUTH_RE);
      if (noPreauth) {
        pendingAsrepUser = noPreauth[1];
        continue;
      }

      if (pendingAsrepUser && ASREP_HASH_RE.test(trimmed)) {
        out.findings.push({
          scannerName: 'kerbrute',
          title: `AS-REP roastable account: ${pendingAsrepUser}`,
          severity: 'HIGH',
          location: ctx.target,
          description:
            'Account has Kerberos pre-auth disabled; the AS-REP hash is crackable offline.',
          evidence: { username: pendingAsrepUser, asrepHash: trimmed },
        });
        pendingAsrepUser = undefined;
      }
    }

    return out;
  }
}
