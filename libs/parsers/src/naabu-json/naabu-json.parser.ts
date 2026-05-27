import { Injectable, Logger } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext, Protocol } from '../types';
import { emptyNormalizedOutput } from '../types';

interface NaabuLine {
  host?: string;
  ip?: string;
  port?: number;
  protocol?: string;
}

function normalizeIp(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeProtocol(value: string | undefined): Protocol {
  switch ((value ?? '').trim().toLowerCase()) {
    case 'udp':
      return 'UDP';
    case 'tcp':
    case '':
    default:
      // Naabu is primarily TCP; treat missing/unknown as TCP for safety.
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

      const ip = normalizeIp(parsed.ip);
      if (!ip) continue;

      if (!seenIps.has(ip)) {
        seenIps.add(ip);
        out.assets.push({ type: 'IP', value: ip });
      }

      out.ports.push({
        assetValue: ip,
        number: parsed.port,
        protocol: normalizeProtocol(parsed.protocol),
        state: 'OPEN',
      });
    }

    return out;
  }
}
