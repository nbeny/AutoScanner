import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HttpxJsonParser } from '../httpx-json/httpx-json.parser';
import type { ParserContext } from '../types';

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'httpx-hackerone.jsonl'), 'utf8');

const ctx: ParserContext = {
  scanJobId: 'job_1',
  scannerName: 'httpx',
  target: 'hackerone.com',
  engagementId: 'eng_1',
};

describe('HttpxJsonParser', () => {
  const parser = new HttpxJsonParser();

  it('declares name and supported formats', () => {
    expect(parser.name).toBe('httpx-json');
    expect(parser.formats).toEqual(['JSONL']);
  });

  it('parses JSONL into SUBDOMAIN assets keyed by `input`', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    expect(out.assets.length).toBeGreaterThanOrEqual(3);
    for (const a of out.assets) {
      expect(a.type).toBe('SUBDOMAIN');
    }
    const values = out.assets.map((a) => a.value);
    expect(values).toContain('www.hackerone.com');
    expect(values).toContain('api.hackerone.com');
    expect(values).toContain('mta-sts.hackerone.com');
    // canonicalization: lowercases + strips trailing dot
    expect(values).toContain('docs.hackerone.com');
    expect(values).not.toContain('DOCS.Hackerone.com.');
  });

  it('emits one NormalizedTechnology per tech[] entry with assetValue=host', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    // www has 3 techs, api has 0, mta-sts has none (no `tech` key), docs has 2.
    // Total tech entries across the fixture = 3 + 0 + 0 + 2 = 5.
    expect(out.technologies.length).toBe(5);
    const wwwTechs = out.technologies
      .filter((t) => t.assetValue === 'www.hackerone.com')
      .map((t) => t.name);
    expect(wwwTechs).toEqual(expect.arrayContaining(['Cloudflare', 'HSTS', 'Varnish']));

    const docsTechs = out.technologies
      .filter((t) => t.assetValue === 'docs.hackerone.com')
      .map((t) => t.name);
    expect(docsTechs).toEqual(expect.arrayContaining(['Cloudflare', 'Nginx']));

    // No version info in this mode of httpx
    for (const t of out.technologies) {
      expect(t.version).toBeUndefined();
    }
  });

  it('emits NormalizedHttpProbe per line carrying status/title/server', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    // All 4 valid lines have at least a status_code → 4 probes
    expect(out.httpProbes.length).toBe(4);

    const wwwProbe = out.httpProbes.find((p) => p.assetValue === 'www.hackerone.com');
    expect(wwwProbe).toBeDefined();
    expect(wwwProbe?.status).toBe(200);
    expect(wwwProbe?.title).toBe('HackerOne | #1 Trusted Security Platform and Hacker Program');
    expect(wwwProbe?.server).toBe('cloudflare');

    // mta-sts has no title, but has status and server
    const mtaProbe = out.httpProbes.find((p) => p.assetValue === 'mta-sts.hackerone.com');
    expect(mtaProbe).toBeDefined();
    expect(mtaProbe?.status).toBe(404);
    expect(mtaProbe?.title).toBeUndefined();
    expect(mtaProbe?.server).toBe('GitHub.com');

    // probe assetValue is canonicalized like the asset
    const docsProbe = out.httpProbes.find((p) => p.assetValue === 'docs.hackerone.com');
    expect(docsProbe).toBeDefined();
  });

  it('skips blank lines, malformed JSON, and lines missing `input` without throwing', async () => {
    await expect(parser.parse(FIXTURE, ctx)).resolves.toBeDefined();
    const out = await parser.parse(FIXTURE, ctx);
    // Fixture has 4 valid lines + blank + malformed + empty-input → exactly 4 assets.
    expect(out.assets.length).toBe(4);
    for (const a of out.assets) {
      expect(a.value.length).toBeGreaterThan(0);
    }
  });

  it('accepts Buffer input', async () => {
    const out = await parser.parse(Buffer.from(FIXTURE, 'utf8'), ctx);
    expect(out.assets.length).toBe(4);
  });

  it('returns empty NormalizedOutput for empty input', async () => {
    const out = await parser.parse('', ctx);
    expect(out.assets).toEqual([]);
    expect(out.technologies).toEqual([]);
    expect(out.httpProbes).toEqual([]);
  });
});
