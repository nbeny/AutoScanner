import { CloudEnumTextParser } from '../cloud-enum-text';
import type { ParserContext } from '../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'cloud-enum',
  target: 'example.com',
  engagementId: 'e',
};

describe('CloudEnumTextParser', () => {
  const parser = new CloudEnumTextParser();

  it('extracts buckets → one CLOUD_BUCKET OrgMetadata + a Finding per open bucket', async () => {
    const input = [
      'OPEN S3 BUCKET: http://example-assets.s3.amazonaws.com/',
      'Protected S3 Bucket: http://example-private.s3.amazonaws.com/',
    ].join('\n');
    const out = await parser.parse(input, ctx);
    expect(out.orgMetadata).toHaveLength(1);
    expect(out.orgMetadata[0].kind).toBe('CLOUD_BUCKET');
    const data = out.orgMetadata[0].data as { buckets: { url: string; access: string }[] };
    expect(data.buckets.length).toBe(2);
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0].severity).toBe('HIGH');
    expect(out.findings[0].location).toContain('example-assets');
  });

  it('returns empty on blank input', async () => {
    expect((await parser.parse('', ctx)).orgMetadata).toHaveLength(0);
  });
});
