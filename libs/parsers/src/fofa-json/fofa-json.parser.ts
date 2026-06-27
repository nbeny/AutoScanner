import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface FofaRow {
  host?: string;
  ip?: string;
  port?: number;
  title?: string;
  server?: string;
  protocol?: string;
  banner?: string;
}

const SERVER_RE = /^([A-Za-z][A-Za-z0-9_-]*)\/?([0-9][\w.]*)?/;

/**
 * Parser for the fofa-client wrapper JSON output. Each row becomes one IP
 * asset (deduplicated). Server header fingerprints (e.g. "nginx/1.25") are
 * lifted into Technology entries keyed on the same IP.
 */
@Injectable()
export class FofaJsonParser implements Parser {
  readonly name = 'fofa-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    let arr: unknown;
    try {
      arr = JSON.parse(text);
    } catch {
      return out;
    }
    if (!Array.isArray(arr)) return out;

    const byIp = new Map<string, Set<string>>();
    for (const row of arr as FofaRow[]) {
      const ip = row.ip?.trim();
      if (!ip) continue;
      const hostnames = byIp.get(ip) ?? new Set<string>();
      const host = row.host?.trim();
      if (host && host !== ip) hostnames.add(host.toLowerCase());
      byIp.set(ip, hostnames);

      const server = row.server?.trim();
      if (server) {
        const m = server.match(SERVER_RE);
        if (m) {
          out.technologies.push({
            assetValue: ip,
            name: m[1],
            version: m[2] || undefined,
          });
        }
      }
    }

    for (const [ip, hostnames] of byIp) {
      out.assets.push({
        type: 'IP',
        value: ip,
        hostnames: hostnames.size > 0 ? Array.from(hostnames).sort() : undefined,
      });
    }
    return out;
  }
}
