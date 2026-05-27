import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SubfinderJsonParser } from '../subfinder-json/subfinder-json.parser';
import type { ParserContext } from '../types';

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'subfinder-hackerone.jsonl'), 'utf8');

const ctx: ParserContext = {
  scanJobId: 'job_1',
  scannerName: 'subfinder',
  target: 'hackerone.com',
  engagementId: 'eng_1',
};

describe('SubfinderJsonParser', () => {
  const parser = new SubfinderJsonParser();

  it('declares name and supported formats', () => {
    expect(parser.name).toBe('subfinder-json');
    expect(parser.formats).toEqual(['JSONL']);
  });

  it('parses JSONL into SUBDOMAIN assets', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    expect(out.assets.length).toBeGreaterThanOrEqual(5);
    for (const a of out.assets) {
      expect(a.type).toBe('SUBDOMAIN');
    }
    const values = out.assets.map((a) => a.value);
    expect(values).toContain('www.hackerone.com');
    expect(values).toContain('api.hackerone.com');
    expect(values).toContain('docs.hackerone.com');
    expect(values).toContain('hackerone.com');
    expect(values).toContain('3d.hackerone.com');
  });

  it('lowercases values and strips trailing dots', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    for (const a of out.assets) {
      expect(a.value).toBe(a.value.toLowerCase());
      expect(a.value.endsWith('.')).toBe(false);
    }
    // case-insensitive WWW.Hackerone.com -> www.hackerone.com (appears multiple times in fixture)
    const values = out.assets.map((a) => a.value);
    expect(values).toContain('www.hackerone.com');
    // trailing-dot stripped
    expect(values).toContain('support.hackerone.com');
    expect(values).not.toContain('support.hackerone.com.');
  });

  it('skips blank lines and lines missing host without throwing', async () => {
    await expect(parser.parse(FIXTURE, ctx)).resolves.toBeDefined();
    const out = await parser.parse(FIXTURE, ctx);
    // No empty-string asset slipped through
    for (const a of out.assets) {
      expect(a.value.length).toBeGreaterThan(0);
    }
  });

  it('accepts Buffer input', async () => {
    const out = await parser.parse(Buffer.from(FIXTURE, 'utf8'), ctx);
    expect(out.assets.length).toBeGreaterThanOrEqual(5);
  });

  it('returns empty NormalizedOutput for empty input', async () => {
    const out = await parser.parse('', ctx);
    expect(out.assets).toEqual([]);
  });
});
