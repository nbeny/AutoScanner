import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface JsReconSecret {
  type?: string;
  match?: string;
  jsUrl?: string;
}

interface JsReconOutput {
  endpoints?: unknown;
  secrets?: unknown;
}

@Injectable()
export class JsReconJsonParser implements Parser {
  readonly name = 'js-recon-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    let parsed: JsReconOutput;
    try {
      parsed = JSON.parse(text) as JsReconOutput;
    } catch {
      return out;
    }

    if (Array.isArray(parsed.endpoints)) {
      const seen = new Set<string>();
      for (const ep of parsed.endpoints) {
        if (typeof ep !== 'string' || !ep.trim() || seen.has(ep)) continue;
        seen.add(ep);
        out.endpoints.push({ url: ep });
      }
    }

    if (Array.isArray(parsed.secrets)) {
      for (const s of parsed.secrets as JsReconSecret[]) {
        if (!s || typeof s.type !== 'string') continue;
        out.findings.push({
          scannerName: ctx.scannerName,
          title: `Exposed secret in JS: ${s.type}`,
          severity: 'MEDIUM',
          location: typeof s.jsUrl === 'string' ? s.jsUrl : undefined,
          description: 'js-recon matched a secret pattern in a JavaScript file served by the host.',
        });
      }
    }

    return out;
  }
}
