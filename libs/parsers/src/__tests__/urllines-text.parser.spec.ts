import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { UrllinesTextParser } from '../urllines-text/urllines-text.parser';
import type { ParserContext } from '../types';

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'urllines-sample.txt'), 'utf8');

const ctx: ParserContext = {
  scanJobId: 'job_1',
  scannerName: 'gau',
  target: 'example.com',
  engagementId: 'eng_1',
};

describe('UrllinesTextParser', () => {
  const parser = new UrllinesTextParser();

  it('declares name and supported formats', () => {
    expect(parser.name).toBe('urllines-text');
    expect(parser.formats).toEqual(['TEXT']);
  });

  it('parses newline-delimited URLs into endpoints with method GET', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    const urls = out.endpoints.map((e) => e.url);
    expect(urls).toContain('https://example.com/');
    expect(urls).toContain('https://example.com/admin');
    expect(urls).toContain('http://example.com/login');
    for (const e of out.endpoints) expect(e.method).toBe('GET');
  });

  it('skips blank lines and # comments', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    const urls = out.endpoints.map((e) => e.url);
    expect(urls).not.toContain('');
    expect(urls.some((u) => u.startsWith('#'))).toBe(false);
  });

  it('dedupes within run — 3 distinct URLs', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    expect(out.endpoints).toHaveLength(3);
  });

  it('does NOT lowercase URL paths (paths are case-sensitive)', async () => {
    const out = await parser.parse(
      'https://example.com/AdminPanel\nhttps://example.com/adminpanel\n',
      ctx,
    );
    const urls = out.endpoints.map((e) => e.url);
    expect(urls).toContain('https://example.com/AdminPanel');
    expect(urls).toContain('https://example.com/adminpanel');
    expect(out.endpoints).toHaveLength(2);
  });

  it('accepts Buffer input', async () => {
    const out = await parser.parse(Buffer.from(FIXTURE, 'utf8'), ctx);
    expect(out.endpoints).toHaveLength(3);
  });

  it('returns empty output for empty input', async () => {
    const out = await parser.parse('', ctx);
    expect(out.endpoints).toEqual([]);
  });
});
