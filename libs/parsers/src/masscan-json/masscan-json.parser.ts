import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface MasscanPort {
  port: number;
  proto: string;
  status: string;
  reason?: string;
}

interface MasscanEntry {
  ip: string;
  timestamp: string;
  ports: MasscanPort[];
}

@Injectable()
export class MasscanJsonParser implements Parser {
  readonly name = 'masscan-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = Buffer.isBuffer(input) ? input.toString('utf8') : input;
    if (!text.trim()) return out;

    let entries: MasscanEntry[];
    try {
      entries = JSON.parse(text) as MasscanEntry[];
    } catch {
      return out;
    }
    if (!Array.isArray(entries)) return out;

    for (const entry of entries) {
      if (!entry.ip || !Array.isArray(entry.ports)) continue;
      for (const p of entry.ports) {
        if (p.status !== 'open') continue;
        out.ports.push({
          assetValue: entry.ip,
          number: p.port,
          protocol: p.proto.toUpperCase() === 'UDP' ? 'UDP' : 'TCP',
          state: 'OPEN',
          reason: p.reason,
        });
      }
    }
    return out;
  }
}
