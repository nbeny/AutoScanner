import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

// Matches onesixtyone output: e.g. "10.0.0.1 [public] Linux router 5.10"
const COMMUNITY_RE = /\[(\w+)\]/;
// Matches snmpwalk sysDescr line. snmpwalk prints the OID as either
// 'iso.3.6.1.2.1.1.1.0' or '1.3.6.1.2.1.1.1.0' or 'SNMPv2-MIB::sysDescr.0'
// We match any of these followed by = STRING:
const SYSDESCR_RE = /(?:(?:iso\.)?3\.6\.1\.2\.1\.1\.1\.0|sysDescr\.0)\s*=\s*STRING:\s*"?([^"]+)"?/;

@Injectable()
export class SnmpTextParser implements Parser {
  readonly name = 'snmp-text';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = Buffer.isBuffer(input) ? input.toString('utf8') : input;
    if (!text.trim()) return out;

    try {
      const seenCommunities = new Set<string>();

      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const communityMatch = COMMUNITY_RE.exec(trimmed);
        if (communityMatch) {
          const community = communityMatch[1];
          if (!seenCommunities.has(community)) {
            seenCommunities.add(community);
            out.findings.push({
              scannerName: ctx.scannerName,
              title: `Readable SNMP community: ${community}`,
              severity: 'MEDIUM',
              location: ctx.target,
              description: trimmed,
            });
          }
        }

        const sysDescrMatch = SYSDESCR_RE.exec(trimmed);
        if (sysDescrMatch) {
          out.orgMetadata.push({
            kind: 'OTHER',
            data: { snmpSysDescr: sysDescrMatch[1].trim() },
          });
        }
      }
    } catch {
      return emptyNormalizedOutput();
    }

    return out;
  }
}
