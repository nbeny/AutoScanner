import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedFinding, NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

const BANNER_RE = /<-\s+220\s+(.+)/;
const AUTH_LINE_RE = /<-\s+250[\s-]+AUTH\s+(.+)/i;
const STARTTLS_LINE_RE = /<-\s+250[\s-]+STARTTLS/i;
const TLS_VERSION_RE = /TLS started with cipher\s+(TLSv[\d.]+):/i;
const VERSION_LEAK_RE = /\d+\.\d+(?:\.\d+)?/;

interface SmtpProfile {
  banner: string;
  ehloHostname: string | null;
  authMethods: string[];
  starttlsOffered: boolean;
  tlsVersion: string | null;
}

function buildProfile(text: string): SmtpProfile {
  const p: SmtpProfile = {
    banner: '',
    ehloHostname: null,
    authMethods: [],
    starttlsOffered: false,
    tlsVersion: null,
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const banner = BANNER_RE.exec(line);
    if (banner && !p.banner) p.banner = banner[1].trim();
    const auth = AUTH_LINE_RE.exec(line);
    if (auth) {
      p.authMethods.push(
        ...auth[1]
          .trim()
          .split(/\s+/)
          .filter((m) => m.length > 0),
      );
    }
    if (STARTTLS_LINE_RE.test(line)) p.starttlsOffered = true;
    const tls = TLS_VERSION_RE.exec(line);
    if (tls) p.tlsVersion = tls[1];
  }
  return p;
}

function tlsVersionAtLeast(version: string, min: '1.2'): boolean {
  const m = version.match(/TLSv([\d.]+)/);
  if (!m) return false;
  return parseFloat(m[1]) >= parseFloat(min);
}

@Injectable()
export class SwaksTextParser implements Parser {
  readonly name = 'swaks-text';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    const p = buildProfile(text);
    if (!p.banner && p.authMethods.length === 0 && !p.starttlsOffered && !p.tlsVersion) {
      return out;
    }
    out.orgMetadata.push({ kind: 'OTHER', data: p });

    const push = (title: string, severity: NormalizedFinding['severity']): void => {
      out.findings.push({
        scannerName: ctx.scannerName,
        title,
        severity,
        location: ctx.target,
      });
    };

    const tlsActive = p.tlsVersion !== null;

    if (p.authMethods.includes('PLAIN') && !tlsActive) {
      push('SWAKS_AUTH_PLAIN_NO_TLS', 'HIGH');
    }
    if (!p.starttlsOffered && !tlsActive) {
      push('SWAKS_STARTTLS_MISSING', 'MEDIUM');
    }
    if (p.tlsVersion && !tlsVersionAtLeast(p.tlsVersion, '1.2')) {
      push('SWAKS_WEAK_TLS', 'MEDIUM');
    }
    if (p.banner && VERSION_LEAK_RE.test(p.banner)) {
      push('SWAKS_BANNER_VERSION_LEAK', 'LOW');
    }

    return out;
  }
}
