import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

/**
 * Parser for sslscan `--no-colour` text output.
 *
 * Emits `Finding` entries (via `out.findings`) for:
 *   - Weak SSL/TLS protocols that are explicitly `enabled`
 *     (SSLv2, SSLv3, TLSv1.0, TLSv1.1). Strong protocols (TLSv1.2/1.3)
 *     and disabled weak protocols are NOT flagged.
 *   - Cipher lines in the "Supported Server Cipher(s)" section that contain
 *     a weak cipher token (RC4, NULL, EXPORT, DES, MD5, anon). Findings
 *     are deduped by title.
 *
 * Finding location is always `https://${ctx.target}` so the parse-job-worker
 * can resolve the owning asset via `new URL(location).hostname`.
 *
 * Tolerant: empty input returns empty output; never throws.
 */
@Injectable()
export class SslscanTextParser implements Parser {
  readonly name = 'sslscan-text';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  private static readonly WEAK_PROTOCOLS = new Set(['SSLv2', 'SSLv3', 'TLSv1.0', 'TLSv1.1']);

  private static readonly WEAK_CIPHER_TOKENS = ['RC4', 'NULL', 'EXPORT', 'DES', 'MD5', 'anon'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');

    if (!text.trim()) return out;

    const location = `https://${ctx.target}`;
    const seenTitles = new Set<string>();

    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Check for weak protocol enabled lines.
      // sslscan format: "  SSLv3     enabled" or "  TLSv1.0   disabled"
      const protoMatch =
        /^(SSLv2|SSLv3|TLSv1\.0|TLSv1\.1|TLSv1\.2|TLSv1\.3)\s+(enabled|disabled)/.exec(trimmed);
      if (protoMatch) {
        const proto = protoMatch[1];
        const state = protoMatch[2];
        if (state === 'enabled' && SslscanTextParser.WEAK_PROTOCOLS.has(proto)) {
          const title = `Weak SSL/TLS protocol enabled: ${proto}`;
          if (!seenTitles.has(title)) {
            seenTitles.add(title);
            out.findings.push({
              scannerName: 'sslscan',
              title,
              severity: 'MEDIUM',
              location,
            });
          }
        }
        continue;
      }

      // Check for weak cipher lines.
      // sslscan cipher lines look like:
      //   "Accepted  TLSv1.0  112 bits  ECDHE-RSA-DES-CBC3-SHA"
      //   "Accepted  TLSv1.2   256 bits  ECDHE-RSA-AES256-GCM-SHA384"
      if (/^(Accepted|Preferred)\s/.test(trimmed)) {
        for (const token of SslscanTextParser.WEAK_CIPHER_TOKENS) {
          if (trimmed.includes(token)) {
            const title = `Weak cipher supported: ${token}`;
            if (!seenTitles.has(title)) {
              seenTitles.add(title);
              out.findings.push({
                scannerName: 'sslscan',
                title,
                severity: 'LOW',
                location,
              });
            }
            // Only emit one finding per cipher token per line (first match wins).
            break;
          }
        }
      }
    }

    return out;
  }
}
