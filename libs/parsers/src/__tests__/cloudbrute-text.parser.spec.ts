import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CloudbruteTextParser } from '../cloudbrute-text/cloudbrute-text.parser';
import type { ParserContext } from '../types';

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'cloudbrute-sample.txt'), 'utf8');
const ctx: ParserContext = {
  scanJobId: 'job_1',
  scannerName: 'cloudbrute',
  target: 'acme',
  engagementId: 'eng_1',
};

describe('CloudbruteTextParser', () => {
  const parser = new CloudbruteTextParser();

  it('declares name and formats', () => {
    expect(parser.name).toBe('cloudbrute-text');
    expect(parser.formats).toEqual(['TEXT']);
  });

  it('emits a LOW finding per discovered public resource URL', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    expect(out.findings).toHaveLength(2);
    expect(out.findings.every((f) => f.severity === 'LOW')).toBe(true);
    expect(out.findings.every((f) => f.scannerName === 'cloudbrute')).toBe(true);
    expect(out.findings.map((f) => f.location)).toEqual([
      'https://acme.s3.amazonaws.com',
      'https://acme-dev.storage.googleapis.com',
    ]);
    expect(out.findings[0].title).toBe('Public cloud resource discovered');
  });

  it('returns empty output when no URLs are present', async () => {
    const out = await parser.parse('[i] nothing found\n', ctx);
    expect(out.findings).toHaveLength(0);
  });
});
