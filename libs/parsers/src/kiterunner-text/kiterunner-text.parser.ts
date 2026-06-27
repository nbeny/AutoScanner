import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedFinding, NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

// Matches kiterunner output lines, e.g.:
// GET     200 [  1234,   45,  6] https://api.example.com/api/v1/users 0cf6841b
const LINE_RE = /^(\w+)\s+(\d{3})\s+\[[^\]]*\]\s+(https?:\/\/\S+)/;

const SENSITIVE_PATH_RE =
  /\/(?:admin|internal|debug|console|management|actuator)(?:\/|$)|\/v\d+\/users(?:\/|$)/i;

function classify(status: number, url: string, scannerName: string): NormalizedFinding | null {
  if (status !== 200) return null;
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  if (SENSITIVE_PATH_RE.test(pathname)) {
    return {
      scannerName,
      title: 'KITERUNNER_SENSITIVE_ROUTE',
      severity: 'HIGH',
      location: url,
    };
  }
  return {
    scannerName,
    title: 'KITERUNNER_UNDOCUMENTED_ROUTE',
    severity: 'MEDIUM',
    location: url,
  };
}

@Injectable()
export class KiterunnerTextParser implements Parser {
  readonly name = 'kiterunner-text';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = Buffer.isBuffer(input) ? input.toString('utf8') : input;
    if (!text.trim()) return out;

    const seenUrls = new Set<string>();

    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const match = LINE_RE.exec(trimmed);
      if (!match) continue;

      const method = match[1];
      const statusCode = Number(match[2]);
      const url = match[3].replace(/\s.*$/, '');

      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        out.endpoints.push({ url, method, statusCode });
      }
      const finding = classify(statusCode, url, ctx.scannerName);
      if (finding) out.findings.push(finding);
    }
    return out;
  }
}
