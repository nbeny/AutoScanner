import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedFinding, NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

const HIGH_CONFIDENCE_KINDS = new Set<string>([
  'AWSAccessKey',
  'AWSSecretKey',
  'GoogleAPIKey',
  'JWT',
  'OAuthToken',
  'GitHubToken',
  'StripeAPIKey',
  'TwilioKey',
]);

interface UrlRow {
  url?: string;
  type?: string;
  source?: string;
}

interface SecretRow {
  kind?: string;
  data?: string;
  filename?: string;
}

function pickSeverity(kind: string): NormalizedFinding['severity'] {
  return HIGH_CONFIDENCE_KINDS.has(kind) ? 'HIGH' : 'MEDIUM';
}

@Injectable()
export class JsluiceJsonlParser implements Parser {
  readonly name = 'jsluice-jsonl';
  readonly formats: RawOutputFormat[] = ['JSONL'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    const seenUrls = new Set<string>();

    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      let parsed: UrlRow & SecretRow;
      try {
        parsed = JSON.parse(line) as UrlRow & SecretRow;
      } catch {
        continue;
      }
      if (parsed.kind && parsed.data) {
        out.findings.push({
          scannerName: 'jsluice',
          title: `JSLUICE_SECRET_${parsed.kind}`,
          severity: pickSeverity(parsed.kind),
          location: parsed.filename,
          evidence: { kind: parsed.kind, sample: parsed.data.slice(0, 40) },
        });
        continue;
      }
      if (parsed.url && !seenUrls.has(parsed.url)) {
        seenUrls.add(parsed.url);
        out.endpoints.push({ url: parsed.url });
      }
    }
    return out;
  }
}
