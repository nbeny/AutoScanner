import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedFinding, NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface S3Acl {
  read?: boolean;
  write?: boolean;
}
interface S3Bucket {
  name?: string;
  exists?: boolean;
  provider?: string;
  region?: string;
  permissions?: { all_users?: S3Acl; auth_users?: S3Acl };
}

@Injectable()
export class S3scannerJsonParser implements Parser {
  readonly name = 's3scanner-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');

    let parsed: S3Bucket | S3Bucket[];
    try {
      parsed = JSON.parse(text) as S3Bucket | S3Bucket[];
    } catch {
      return out;
    }
    const buckets = Array.isArray(parsed) ? parsed : [parsed];

    for (const bucket of buckets) {
      if (!bucket || bucket.exists !== true || !bucket.name) continue;
      const all = bucket.permissions?.all_users ?? {};
      const auth = bucket.permissions?.auth_users ?? {};
      const writable = all.write === true;
      const listable = all.read === true || auth.read === true;

      let finding: NormalizedFinding;
      if (writable) {
        finding = {
          scannerName: 's3scanner',
          title: `World-writable cloud bucket: ${bucket.name}`,
          severity: 'HIGH',
          location: bucket.name,
          description: 'Bucket grants write to AllUsers — anyone can upload/overwrite objects.',
          evidence: bucket,
        };
      } else if (listable) {
        finding = {
          scannerName: 's3scanner',
          title: `Public/listable cloud bucket: ${bucket.name}`,
          severity: 'MEDIUM',
          location: bucket.name,
          description: 'Bucket is publicly readable/listable.',
          evidence: bucket,
        };
      } else {
        finding = {
          scannerName: 's3scanner',
          title: `Cloud bucket exists: ${bucket.name}`,
          severity: 'INFO',
          location: bucket.name,
          evidence: bucket,
        };
      }
      out.findings.push(finding);
    }

    return out;
  }
}
