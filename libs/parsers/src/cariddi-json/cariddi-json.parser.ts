import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedFinding, NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface CariddiMatch {
  name?: string;
  match?: string;
  parameter?: string;
}

interface CariddiResult {
  url?: string;
  matches?: {
    secrets?: CariddiMatch[];
    endpoints?: CariddiMatch[];
    infos?: CariddiMatch[];
    errors?: CariddiMatch[];
  };
}

interface CariddiOutput {
  results?: CariddiResult[];
}

const SCANNER = 'cariddi';

function finding(
  title: string,
  severity: NormalizedFinding['severity'],
  location: string,
  evidence: unknown,
): NormalizedFinding {
  return { scannerName: SCANNER, title, severity, location, evidence };
}

@Injectable()
export class CariddiJsonParser implements Parser {
  readonly name = 'cariddi-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    let parsed: CariddiOutput;
    try {
      parsed = JSON.parse(text) as CariddiOutput;
    } catch {
      return out;
    }

    for (const r of parsed.results ?? []) {
      const url = r.url;
      if (!url) continue;

      for (const s of r.matches?.secrets ?? []) {
        out.findings.push(
          finding(`cariddi secret: ${s.name ?? 'unknown'}`, 'HIGH', url, { match: s.match }),
        );
      }

      for (const e of r.matches?.endpoints ?? []) {
        out.findings.push(
          finding(
            `cariddi endpoint: ${e.parameter ?? e.name ?? 'interesting endpoint'}`,
            'LOW',
            url,
            e,
          ),
        );
        out.endpoints.push({ url, method: 'GET' });
      }

      for (const i of r.matches?.infos ?? []) {
        out.findings.push(
          finding(`cariddi info: ${i.name ?? 'Interesting endpoint'}`, 'LOW', url, {
            match: i.match,
          }),
        );
        out.endpoints.push({ url, method: 'GET' });
      }

      for (const err of r.matches?.errors ?? []) {
        out.findings.push(
          finding(`cariddi error page: ${err.name ?? 'error'}`, 'LOW', url, {
            match: err.match,
          }),
        );
      }
    }

    return out;
  }
}
