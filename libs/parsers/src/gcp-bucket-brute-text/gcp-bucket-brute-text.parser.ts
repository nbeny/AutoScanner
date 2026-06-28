import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedFinding, NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface Bucket {
  name: string;
  permissions: string;
}

function classify(
  permissions: string,
): { title: string; severity: NormalizedFinding['severity'] } | null {
  const p = permissions.toLowerCase();
  if (p.includes('allusers:read+list') || p.includes('allusers:list')) {
    return { title: 'GCP_BUCKET_PUBLIC_LIST', severity: 'HIGH' };
  }
  if (p.includes('allusers:read')) {
    return { title: 'GCP_BUCKET_PUBLIC_READ', severity: 'MEDIUM' };
  }
  if (p.includes('allauthenticatedusers:read')) {
    return { title: 'GCP_BUCKET_AUTH_READ', severity: 'LOW' };
  }
  return null;
}

@Injectable()
export class GcpBucketBruteTextParser implements Parser {
  readonly name = 'gcp-bucket-brute-text';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    const buckets: Bucket[] = [];

    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      const commaIdx = line.indexOf(',');
      if (commaIdx === -1) continue;
      const name = line.slice(0, commaIdx).trim();
      const permissions = line.slice(commaIdx + 1).trim();
      if (!name) continue;
      buckets.push({ name, permissions });

      const mapped = classify(permissions);
      if (mapped) {
        out.findings.push({
          scannerName: ctx.scannerName,
          title: mapped.title,
          severity: mapped.severity,
          location: name,
          evidence: { permissions },
        });
      }
    }

    if (buckets.length > 0) {
      out.orgMetadata.push({ kind: 'CLOUD_BUCKET', data: { provider: 'gcp', buckets } });
    }
    return out;
  }
}
