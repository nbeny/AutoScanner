import { GcpBucketBruteTextParser } from '../gcp-bucket-brute-text.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'gcp-bucket-brute',
  target: 'acme.tld',
  engagementId: 'e',
};

const SAMPLE = [
  'acme-public,allUsers:read+list',
  'acme-readable,allUsers:read',
  'acme-shared,allAuthenticatedUsers:read',
  'acme-private,',
  'acme-private2,owner-only',
  '',
  'malformed line without comma',
].join('\n');

describe('GcpBucketBruteTextParser', () => {
  const parser = new GcpBucketBruteTextParser();

  it('emits a single OrgMetadata with all discovered buckets', async () => {
    const out = await parser.parse(SAMPLE, ctx);
    expect(out.orgMetadata).toHaveLength(1);
    expect(out.orgMetadata[0].kind).toBe('CLOUD_BUCKET');
    const data = out.orgMetadata[0].data as {
      provider: string;
      buckets: { name: string; permissions: string }[];
    };
    expect(data.provider).toBe('gcp');
    const names = data.buckets.map((b) => b.name).sort();
    expect(names).toEqual([
      'acme-private',
      'acme-private2',
      'acme-public',
      'acme-readable',
      'acme-shared',
    ]);
  });

  it('maps allUsers:read+list → HIGH (GCP_BUCKET_PUBLIC_LIST)', async () => {
    const out = await parser.parse(SAMPLE, ctx);
    const f = out.findings.find((x) => x.location === 'acme-public');
    expect(f).toMatchObject({
      scannerName: 'gcp-bucket-brute',
      title: 'GCP_BUCKET_PUBLIC_LIST',
      severity: 'HIGH',
    });
  });

  it('maps allUsers:read → MEDIUM (GCP_BUCKET_PUBLIC_READ)', async () => {
    const out = await parser.parse(SAMPLE, ctx);
    const f = out.findings.find((x) => x.location === 'acme-readable');
    expect(f).toMatchObject({
      scannerName: 'gcp-bucket-brute',
      title: 'GCP_BUCKET_PUBLIC_READ',
      severity: 'MEDIUM',
    });
  });

  it('maps allAuthenticatedUsers:read → LOW (GCP_BUCKET_AUTH_READ)', async () => {
    const out = await parser.parse(SAMPLE, ctx);
    const f = out.findings.find((x) => x.location === 'acme-shared');
    expect(f).toMatchObject({
      scannerName: 'gcp-bucket-brute',
      title: 'GCP_BUCKET_AUTH_READ',
      severity: 'LOW',
    });
  });

  it('emits no Finding for owner-only or empty-permission buckets', async () => {
    const out = await parser.parse(SAMPLE, ctx);
    expect(out.findings.find((x) => x.location === 'acme-private')).toBeUndefined();
    expect(out.findings.find((x) => x.location === 'acme-private2')).toBeUndefined();
  });

  it('drops malformed lines (no comma) without throwing', async () => {
    const out = await parser.parse(SAMPLE, ctx);
    const data = out.orgMetadata[0].data as { buckets: { name: string }[] };
    expect(data.buckets.find((b) => b.name.includes('malformed'))).toBeUndefined();
  });

  it('returns empty output on empty input', async () => {
    const out = await parser.parse('', ctx);
    expect(out.orgMetadata).toHaveLength(0);
    expect(out.findings).toHaveLength(0);
  });
});
