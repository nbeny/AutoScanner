import * as fs from 'fs';
import * as path from 'path';
import { SslscanTextParser } from '../sslscan-text/sslscan-text.parser';
import type { ParserContext } from '../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'sslscan',
  target: 'example.com',
  engagementId: 'e',
};

const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'sslscan-sample.txt'), 'utf8');

describe('SslscanTextParser', () => {
  let parser: SslscanTextParser;

  beforeEach(() => {
    parser = new SslscanTextParser();
  });

  it('declares name and formats', () => {
    expect(parser.name).toBe('sslscan-text');
    expect(parser.formats).toEqual(['TEXT']);
  });

  it('returns empty output for empty input', async () => {
    const out = await parser.parse('', ctx);
    expect(out.findings).toHaveLength(0);
  });

  it('returns empty output for whitespace-only input', async () => {
    const out = await parser.parse('   \n  ', ctx);
    expect(out.findings).toHaveLength(0);
  });

  describe('fixture parse', () => {
    it('emits exactly 2 findings from the sample fixture', async () => {
      const out = await parser.parse(fixture, ctx);
      expect(out.findings).toHaveLength(2);
    });

    it('flags SSLv3 (enabled weak protocol) with severity MEDIUM', async () => {
      const out = await parser.parse(fixture, ctx);
      const proto = out.findings.find((f) => f.title === 'Weak SSL/TLS protocol enabled: SSLv3');
      expect(proto).toBeDefined();
      expect(proto?.severity).toBe('MEDIUM');
    });

    it('does NOT flag TLSv1.2 (strong protocol)', async () => {
      const out = await parser.parse(fixture, ctx);
      const strong = out.findings.find((f) => f.title.includes('TLSv1.2'));
      expect(strong).toBeUndefined();
    });

    it('does NOT flag TLSv1.0 (disabled)', async () => {
      const out = await parser.parse(fixture, ctx);
      const disabled = out.findings.find(
        (f) => f.title === 'Weak SSL/TLS protocol enabled: TLSv1.0',
      );
      expect(disabled).toBeUndefined();
    });

    it('flags RC4 weak cipher with severity LOW', async () => {
      const out = await parser.parse(fixture, ctx);
      const cipher = out.findings.find((f) => f.title === 'Weak cipher supported: RC4');
      expect(cipher).toBeDefined();
      expect(cipher?.severity).toBe('LOW');
    });

    it('does NOT flag strong AES-GCM cipher line', async () => {
      const out = await parser.parse(fixture, ctx);
      const strong = out.findings.find(
        (f) => f.title.includes('AES256') || f.title.includes('AES128'),
      );
      expect(strong).toBeUndefined();
    });

    it('sets location to https://example.com on all findings', async () => {
      const out = await parser.parse(fixture, ctx);
      for (const f of out.findings) {
        expect(f.location).toBe('https://example.com');
      }
    });

    it('sets scannerName to sslscan on all findings', async () => {
      const out = await parser.parse(fixture, ctx);
      for (const f of out.findings) {
        expect(f.scannerName).toBe('sslscan');
      }
    });

    it('dedupes findings — no duplicate titles', async () => {
      // Run the parser twice over the fixture appended to itself (forces duplicate lines)
      const doubled = fixture + '\n' + fixture;
      const out = await parser.parse(doubled, ctx);
      const titles = out.findings.map((f) => f.title);
      expect(new Set(titles).size).toBe(titles.length);
    });
  });

  it('accepts Buffer input', async () => {
    const out = await parser.parse(Buffer.from(fixture, 'utf8'), ctx);
    expect(out.findings.length).toBeGreaterThan(0);
  });

  it('does not populate other output channels', async () => {
    const out = await parser.parse(fixture, ctx);
    expect(out.assets).toHaveLength(0);
    expect(out.tlsCertificates).toHaveLength(0);
    expect(out.emails).toHaveLength(0);
  });
});
