import * as path from 'path';
import * as fs from 'fs';
import { CrtshJsonParser } from '../crtsh-json/crtsh-json.parser';
import type { ParserContext } from '../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  engagementId: 'e',
  scannerName: 'crtsh',
  target: 'example.com',
};

const fixturePath = path.join(__dirname, 'fixtures', 'crtsh-sample.json');

describe('CrtshJsonParser', () => {
  let parser: CrtshJsonParser;

  beforeEach(() => {
    parser = new CrtshJsonParser();
  });

  it('has name crtsh-json and formats [JSON]', () => {
    expect(parser.name).toBe('crtsh-json');
    expect(parser.formats).toEqual(['JSON']);
  });

  it('parses the fixture into SUBDOMAIN assets', async () => {
    const body = fs.readFileSync(fixturePath, 'utf8');
    const out = await parser.parse(body, ctx);

    const values = out.assets.map((a) => a.value);

    // name_value with newline splits into two hosts
    expect(values).toContain('example.com');
    expect(values).toContain('www.example.com');

    // wildcard stripped: *.api.example.com -> api.example.com
    expect(values).toContain('api.example.com');

    // Mail.Example.com. -> lowercased + trailing dot stripped
    expect(values).toContain('mail.example.com');

    // all type === SUBDOMAIN
    for (const a of out.assets) {
      expect(a.type).toBe('SUBDOMAIN');
    }
  });

  it('lowercases and strips trailing dots', async () => {
    const body = fs.readFileSync(fixturePath, 'utf8');
    const out = await parser.parse(body, ctx);
    for (const a of out.assets) {
      expect(a.value).toBe(a.value.toLowerCase());
      expect(a.value.endsWith('.')).toBe(false);
    }
  });

  it('strips leading *. wildcard prefix', async () => {
    const body = fs.readFileSync(fixturePath, 'utf8');
    const out = await parser.parse(body, ctx);
    const values = out.assets.map((a) => a.value);
    for (const v of values) {
      expect(v.startsWith('*.')).toBe(false);
    }
  });

  it('deduplicates entries', async () => {
    const body = fs.readFileSync(fixturePath, 'utf8');
    const out = await parser.parse(body, ctx);
    const values = out.assets.map((a) => a.value);
    const unique = [...new Set(values)];
    expect(values.length).toBe(unique.length);
  });

  it('returns empty assets for invalid JSON (no throw)', async () => {
    const out = await parser.parse('not valid json }{', ctx);
    expect(out.assets).toEqual([]);
  });

  it('returns empty assets for non-array body', async () => {
    const out = await parser.parse('{"foo":"bar"}', ctx);
    expect(out.assets).toEqual([]);
  });

  it('accepts Buffer input', async () => {
    const body = fs.readFileSync(fixturePath);
    const out = await parser.parse(body, ctx);
    expect(out.assets.length).toBeGreaterThan(0);
  });
});
