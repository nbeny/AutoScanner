import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface TlsxFingerprintHash {
  sha256?: string;
}

interface TlsxLine {
  host?: string;
  port?: string;
  subject_cn?: string;
  subject_an?: string[];
  issuer_cn?: string;
  not_before?: string;
  not_after?: string;
  fingerprint_hash?: TlsxFingerprintHash;
  tls_version?: string;
  self_signed?: boolean;
  expired?: boolean;
}

const WEAK_TLS_VERSIONS = new Set(['ssl3', 'tls10', 'tls11']);

@Injectable()
export class TlsxJsonParser implements Parser {
  readonly name = 'tlsx-json';
  readonly formats: RawOutputFormat[] = ['JSONL'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');

    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let parsed: TlsxLine;
      try {
        parsed = JSON.parse(trimmed) as TlsxLine;
      } catch {
        // Skip malformed JSON lines defensively.
        continue;
      }

      if (!parsed.host) continue;
      if (!parsed.fingerprint_hash?.sha256) continue;

      const host = parsed.host;
      const fingerprintSha256 = parsed.fingerprint_hash.sha256;

      out.tlsCertificates.push({
        host,
        subjectCn: parsed.subject_cn,
        subjectAn: parsed.subject_an,
        issuerCn: parsed.issuer_cn,
        notBefore: parsed.not_before,
        notAfter: parsed.not_after,
        fingerprintSha256,
        tlsVersion: parsed.tls_version,
        selfSigned: !!parsed.self_signed,
        expired: !!parsed.expired,
      });

      if (parsed.expired) {
        out.findings.push({
          scannerName: 'tlsx',
          title: 'Expired TLS certificate',
          severity: 'MEDIUM',
          location: host,
        });
      }

      if (parsed.self_signed) {
        out.findings.push({
          scannerName: 'tlsx',
          title: 'Self-signed TLS certificate',
          severity: 'LOW',
          location: host,
        });
      }

      if (parsed.tls_version && WEAK_TLS_VERSIONS.has(parsed.tls_version)) {
        out.findings.push({
          scannerName: 'tlsx',
          title: `Weak TLS version: ${parsed.tls_version}`,
          severity: 'MEDIUM',
          location: host,
        });
      }
    }

    return out;
  }
}
