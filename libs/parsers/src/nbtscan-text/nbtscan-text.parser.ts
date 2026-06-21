import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

// Matches a NetBIOS name line: "10.0.0.5\tDC01            \t<00> -"
const NAME_LINE_RE = /^(\d{1,3}(?:\.\d{1,3}){3})\s+(\S+)\s+<([0-9a-fA-F]{2})>/;
// Matches MAC address line: "10.0.0.5\t00:50:56:ab:cd:ef"
const MAC_LINE_RE = /^(\d{1,3}(?:\.\d{1,3}){3})\s+((?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2})\s*$/;

@Injectable()
export class NbtscanTextParser implements Parser {
  readonly name = 'nbtscan-text';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = Buffer.isBuffer(input) ? input.toString('utf8') : input;
    if (!text.trim()) return out;

    const hostnames = new Set<string>();
    let foundIp: string | undefined;
    let mac: string | undefined;

    for (const line of text.split('\n')) {
      const nameLine = NAME_LINE_RE.exec(line.trim());
      if (nameLine) {
        foundIp = nameLine[1];
        const name = nameLine[2].trim();
        const type = nameLine[3];
        // <00> workstation, <20> file server — both are hostnames; <00> GROUP is workgroup
        if (type === '00' || type === '20') {
          if (!line.includes('GROUP')) hostnames.add(name);
        }
      }
      const macLine = MAC_LINE_RE.exec(line.trim());
      if (macLine) mac = macLine[2];
    }

    if (!foundIp) return out;

    out.assets.push({
      type: 'IP',
      value: foundIp,
      hostnames: [...hostnames],
    });

    out.findings.push({
      scannerName: ctx.scannerName,
      title: `NetBIOS name service exposed on ${foundIp}`,
      severity: 'INFO',
      location: foundIp,
      evidence: { hostnames: [...hostnames], mac },
    });

    return out;
  }
}
