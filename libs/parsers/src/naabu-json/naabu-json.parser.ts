import { Injectable, Logger } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import { canonicalize } from '@autoscanner/correlation';
import type { NormalizedOutput, Parser, ParserContext, Protocol } from '../types';
import { emptyNormalizedOutput } from '../types';

interface NaabuLine {
  // Naabu emits the resolved hostname when the input was a domain. We
  // intentionally do *not* promote it to a SUBDOMAIN asset — subfinder owns
  // subdomain discovery, and naabu-derived hostnames would lack provenance
  // (no parent-Domain context for the recon chain). The field is declared so
  // a future enrichment step can read it without re-parsing.
  host?: string;
  ip?: string;
  port?: number;
  protocol?: string;
}

/**
 * Map a raw protocol string to the schema's Protocol enum. Unknown values
 * fall back to TCP with a warning — naabu's JSONL output is documented to
 * carry only `tcp`/`udp`, so anything else indicates an upstream format
 * change worth surfacing rather than silently downgrading.
 */
function normalizeProtocol(value: string | undefined, logger: Logger): Protocol {
  const lowered = (value ?? '').trim().toLowerCase();
  switch (lowered) {
    case 'udp':
      return 'UDP';
    case 'tcp':
    case '':
      return 'TCP';
    default:
      logger.warn(`unknown naabu protocol '${value}', defaulting to TCP`);
      return 'TCP';
  }
}

@Injectable()
export class NaabuJsonParser implements Parser {
  private readonly logger = new Logger(NaabuJsonParser.name);
  readonly name = 'naabu-json';
  readonly formats: RawOutputFormat[] = ['JSONL'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    // Dedup IP assets within a single parse pass. The key is the canonicalised
    // form (RFC 5952 for IPv6) so `2001:0db8::1` and `2001:db8::1` collapse to
    // one asset entry — matches what IpAddressPersister will write downstream.
    const seenIps = new Set<string>();

    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let parsed: NaabuLine;
      try {
        parsed = JSON.parse(trimmed) as NaabuLine;
      } catch {
        // Skip malformed JSON lines defensively.
        this.logger.warn(`skipping malformed naabu JSON line: ${trimmed.slice(0, 120)}`);
        continue;
      }

      if (typeof parsed.ip !== 'string' || parsed.ip.length === 0) continue;
      if (
        typeof parsed.port !== 'number' ||
        !Number.isInteger(parsed.port) ||
        parsed.port < 1 ||
        parsed.port > 65535
      ) {
        continue;
      }

      // canonicalize for IP_ADDRESS does RFC 5952 compression for IPv6 and
      // normalised dotted-decimal for IPv4. Falls back to trim+lowercase on
      // parse failure so malformed inputs still flow through to the persister.
      const ip = canonicalize(parsed.ip, { type: 'IP_ADDRESS' });
      if (!ip) continue;

      if (!seenIps.has(ip)) {
        seenIps.add(ip);
        out.assets.push({ type: 'IP', value: ip });
      }

      out.ports.push({
        assetValue: ip,
        number: parsed.port,
        // Naabu only reports open ports — closed/filtered states never reach
        // the JSONL output, so hardcoding 'OPEN' is faithful to the input.
        state: 'OPEN',
        protocol: normalizeProtocol(parsed.protocol, this.logger),
      });
    }

    return out;
  }
}
