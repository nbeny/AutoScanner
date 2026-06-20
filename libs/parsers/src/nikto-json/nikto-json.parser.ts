import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext, Severity } from '../types';
import { emptyNormalizedOutput } from '../types';

interface NiktoVuln {
  id?: string;
  method?: string;
  url?: string;
  msg?: string;
  OSVDB?: string;
}
interface NiktoHost {
  host?: string;
  vulnerabilities?: NiktoVuln[];
}

// Patterns that warrant raising an otherwise-informational nikto item to MEDIUM.
const MEDIUM_PATTERNS = [/\.git/i, /backup/i, /\bdefault\b/i, /directory indexing/i, /phpinfo/i];

@Injectable()
export class NiktoJsonParser implements Parser {
  readonly name = 'nikto-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');

    let parsed: NiktoHost | NiktoHost[];
    try {
      parsed = JSON.parse(text) as NiktoHost | NiktoHost[];
    } catch {
      return out;
    }

    const hosts = Array.isArray(parsed) ? parsed : [parsed];
    for (const host of hosts) {
      for (const vuln of host.vulnerabilities ?? []) {
        const msg = vuln.msg ?? 'Nikto finding';
        const haystack = `${msg} ${vuln.url ?? ''}`;
        const severity: Severity = MEDIUM_PATTERNS.some((p) => p.test(haystack))
          ? 'MEDIUM'
          : 'INFO';
        out.findings.push({
          scannerName: 'nikto',
          title: msg,
          severity,
          location: vuln.url,
          evidence: { id: vuln.id, method: vuln.method, OSVDB: vuln.OSVDB },
        });
      }
    }

    return out;
  }
}
