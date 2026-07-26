import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface InternetdbRecord {
  ip?: string;
  ports?: number[];
  cpes?: string[];
  hostnames?: string[];
  tags?: string[];
  vulns?: string[];
  detail?: string; // present when InternetDB has no data for the IP
}

const CVE_RE = /^CVE-\d{4}-\d+$/i;

/**
 * Parser for Shodan InternetDB responses (JSONL — one JSON object per queried IP,
 * emitted by the scanner's build script). Open ports become OPEN TCP ports; each
 * `vulns` CVE becomes a finding (cveId set so the CVE-enricher can score it).
 * `{"detail": "No information available"}` records are skipped.
 */
@Injectable()
export class InternetdbJsonParser implements Parser {
  readonly name = 'internetdb-json';
  readonly formats: RawOutputFormat[] = ['JSONL', 'JSON'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = Buffer.isBuffer(input) ? input.toString('utf8') : input;
    if (!text.trim()) return out;

    for (const line of text.split('\n')) {
      const l = line.trim();
      if (!l.startsWith('{')) continue;
      let rec: InternetdbRecord;
      try {
        rec = JSON.parse(l) as InternetdbRecord;
      } catch {
        continue;
      }
      const ip = rec.ip;
      if (!ip || rec.detail) continue;

      out.assets.push({ type: 'IP', value: ip, hostnames: rec.hostnames ?? [] });
      for (const port of rec.ports ?? []) {
        if (!Number.isInteger(port)) continue;
        out.ports.push({ assetValue: ip, number: port, protocol: 'TCP', state: 'OPEN' });
      }
      for (const vuln of rec.vulns ?? []) {
        const cve = typeof vuln === 'string' ? vuln.trim() : '';
        if (!cve) continue;
        out.findings.push({
          scannerName: ctx.scannerName,
          title: `${cve} reported for ${ip} (Shodan InternetDB)`,
          severity: 'MEDIUM',
          location: ip,
          cveId: CVE_RE.test(cve) ? cve.toUpperCase() : undefined,
          evidence: { cpes: rec.cpes ?? [], tags: rec.tags ?? [] },
        });
      }
    }
    return out;
  }
}
