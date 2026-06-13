import * as path from 'path';
import * as fs from 'fs';
import { GobusterTextParser } from '../gobuster-text/gobuster-text.parser';
import type { ParserContext } from '../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  engagementId: 'e',
  scannerName: 'gobuster',
  target: 'example.com',
};

const fixturePath = path.join(__dirname, 'fixtures', 'gobuster-sample.txt');

describe('GobusterTextParser', () => {
  let parser: GobusterTextParser;

  beforeEach(() => {
    parser = new GobusterTextParser();
  });

  it('has name gobuster-text and formats [TEXT]', () => {
    expect(parser.name).toBe('gobuster-text');
    expect(parser.formats).toEqual(['TEXT']);
  });

  it('parses the fixture and yields 2 endpoints with full URLs', async () => {
    const body = fs.readFileSync(fixturePath, 'utf8');
    const out = await parser.parse(body, ctx);
    expect(out.endpoints).toHaveLength(2);
    expect(out.endpoints[0]).toEqual({
      url: 'https://example.com/admin',
      method: 'GET',
      statusCode: 200,
    });
    expect(out.endpoints[1]).toEqual({
      url: 'https://example.com/login',
      method: 'GET',
      statusCode: 301,
    });
  });

  it('skips noise lines (Progress: ...)', async () => {
    const body = fs.readFileSync(fixturePath, 'utf8');
    const out = await parser.parse(body, ctx);
    // Only 2 result lines in fixture, noise line is skipped
    expect(out.endpoints).toHaveLength(2);
  });

  it('returns empty endpoints on empty input', async () => {
    const out = await parser.parse('', ctx);
    expect(out.endpoints).toEqual([]);
  });

  it('builds full URL from ctx.target that already starts with https://', async () => {
    const httpsCtx: ParserContext = { ...ctx, target: 'https://example.com' };
    const out = await parser.parse('/admin                (Status: 200) [Size: 100]', httpsCtx);
    expect(out.endpoints[0].url).toBe('https://example.com/admin');
  });
});
