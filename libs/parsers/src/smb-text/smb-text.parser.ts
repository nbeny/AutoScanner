import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

// Matches lines indicating a null session is allowed (case-insensitive)
const NULL_SESSION_RE = /session using username ''|allows sessions using a NULL|null session/i;

// Matches an OS line: "OS: Windows Server 2019"
const OS_RE = /^OS:\s*(.+)/i;

// Matches a Sharename line: "Sharename: ADMIN$  Type: Disk"
const SHARENAME_RE = /^Sharename:\s*(\S+)/i;

@Injectable()
export class SmbTextParser implements Parser {
  readonly name = 'smb-text';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = Buffer.isBuffer(input) ? input.toString('utf8') : input;
    if (!text.trim()) return out;

    try {
      let nullSessionFound = false;
      let os: string | undefined;
      const shares: string[] = [];

      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (!nullSessionFound && NULL_SESSION_RE.test(trimmed)) {
          nullSessionFound = true;
          out.findings.push({
            scannerName: ctx.scannerName,
            title: 'SMB null session allowed',
            severity: 'MEDIUM',
            location: ctx.target,
          });
        }

        const osMatch = OS_RE.exec(trimmed);
        if (osMatch && !os) {
          os = osMatch[1].trim();
        }

        const sharenameMatch = SHARENAME_RE.exec(trimmed);
        if (sharenameMatch) {
          shares.push(sharenameMatch[1]);
        }
      }

      if (os !== undefined || shares.length > 0) {
        out.orgMetadata.push({
          kind: 'OTHER',
          data: { ...(os !== undefined ? { os } : {}), shares },
        });
      }
    } catch {
      return emptyNormalizedOutput();
    }

    return out;
  }
}
