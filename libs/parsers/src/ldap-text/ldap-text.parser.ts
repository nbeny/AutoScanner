import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

function ldifValue(line: string, attr: string): string | undefined {
  const prefix = `${attr}:`;
  if (!line.startsWith(prefix)) return undefined;
  return line.slice(prefix.length).trim() || undefined;
}

@Injectable()
export class LdapTextParser implements Parser {
  readonly name = 'ldap-text';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = Buffer.isBuffer(input) ? input.toString('utf8') : input;
    if (!text.trim()) return out;

    const namingContexts: string[] = [];
    let defaultNamingContext: string | undefined;
    let dnsHostName: string | undefined;

    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const nc = ldifValue(trimmed, 'namingContexts');
      if (nc) namingContexts.push(nc);

      const dnc = ldifValue(trimmed, 'defaultNamingContext');
      if (dnc) defaultNamingContext = dnc;

      const dns = ldifValue(trimmed, 'dnsHostName');
      if (dns) dnsHostName = dns;
    }

    if (namingContexts.length === 0 && !defaultNamingContext && !dnsHostName) {
      return out;
    }

    out.orgMetadata.push({
      kind: 'OTHER',
      data: {
        namingContexts,
        ...(defaultNamingContext ? { defaultNamingContext } : {}),
        ...(dnsHostName ? { dnsHostName } : {}),
      },
    });

    if (namingContexts.length > 0) {
      out.findings.push({
        scannerName: 'ldap-enum',
        title: 'LDAP anonymous RootDSE accessible',
        severity: 'LOW',
        location: ctx.target,
        evidence: { namingContexts },
      });
    }

    return out;
  }
}
