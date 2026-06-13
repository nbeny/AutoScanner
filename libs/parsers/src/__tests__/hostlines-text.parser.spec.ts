import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HostlinesTextParser } from '../hostlines-text/hostlines-text.parser';
import type { ParserContext } from '../types';

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'hostlines-sample.txt'), 'utf8');

const ctx: ParserContext = {
  scanJobId: 'job_1',
  scannerName: 'findomain',
  target: 'hackerone.com',
  engagementId: 'eng_1',
};

describe('HostlinesTextParser', () => {
  const parser = new HostlinesTextParser();

  it('declares name and supported formats', () => {
    expect(parser.name).toBe('hostlines-text');
    expect(parser.formats).toEqual(['TEXT']);
  });

  it('parses newline-delimited hostnames into SUBDOMAIN assets', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    const values = out.assets.map((a) => a.value);
    expect(values).toContain('www.hackerone.com');
    expect(values).toContain('api.hackerone.com');
    expect(values).toContain('docs.hackerone.com');
    expect(values).toContain('support.hackerone.com');
    for (const a of out.assets) expect(a.type).toBe('SUBDOMAIN');
  });

  it('lowercases, strips trailing dots, skips blanks/comments, and dedupes', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    const values = out.assets.map((a) => a.value);
    expect(values.filter((v) => v === 'www.hackerone.com')).toHaveLength(1);
    expect(values.filter((v) => v === 'api.hackerone.com')).toHaveLength(1);
    expect(values).not.toContain('');
    expect(values.some((v) => v.startsWith('#'))).toBe(false);
    expect(values.some((v) => v.endsWith('.'))).toBe(false);
  });

  it('returns an empty output for empty input', async () => {
    const out = await parser.parse('', ctx);
    expect(out.assets).toEqual([]);
  });
});
