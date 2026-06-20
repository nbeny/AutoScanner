import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { S3scannerJsonParser } from '../s3scanner-json/s3scanner-json.parser';
import type { ParserContext } from '../types';

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 's3scanner-sample.json'), 'utf8');
const ctx: ParserContext = {
  scanJobId: 'job_1',
  scannerName: 's3scanner',
  target: 'acme',
  engagementId: 'eng_1',
};

describe('S3scannerJsonParser', () => {
  const parser = new S3scannerJsonParser();

  it('declares name and formats', () => {
    expect(parser.name).toBe('s3scanner-json');
    expect(parser.formats).toEqual(['JSON']);
  });

  it('maps bucket permissions to graded findings and skips non-existent buckets', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    expect(out.findings).toHaveLength(3);
    const byName = (n: string) => out.findings.find((f) => f.title.includes(n));
    expect(byName('acme-writable')?.severity).toBe('HIGH');
    expect(byName('acme-writable')?.title).toBe('World-writable cloud bucket: acme-writable');
    expect(byName('acme-public')?.severity).toBe('MEDIUM');
    expect(byName('acme-public')?.title).toBe('Public/listable cloud bucket: acme-public');
    expect(byName('acme-private')?.severity).toBe('INFO');
    expect(byName('acme-private')?.title).toBe('Cloud bucket exists: acme-private');
    expect(byName('acme-missing')).toBeUndefined();
    expect(out.findings.every((f) => f.scannerName === 's3scanner')).toBe(true);
  });

  it('returns empty output on malformed JSON', async () => {
    const out = await parser.parse('nope', ctx);
    expect(out.findings).toHaveLength(0);
  });
});
