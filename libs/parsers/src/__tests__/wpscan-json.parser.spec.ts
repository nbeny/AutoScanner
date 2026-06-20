import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WpscanJsonParser } from '../wpscan-json/wpscan-json.parser';
import type { ParserContext } from '../types';

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'wpscan-sample.json'), 'utf8');
const ctx: ParserContext = {
  scanJobId: 'job_1',
  scannerName: 'wpscan',
  target: 'blog.example.com',
  engagementId: 'eng_1',
};

describe('WpscanJsonParser', () => {
  const parser = new WpscanJsonParser();

  it('declares name and formats', () => {
    expect(parser.name).toBe('wpscan-json');
    expect(parser.formats).toEqual(['JSON']);
  });

  it('emits WordPress core, plugin and theme technologies', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    const names = out.technologies.map((t) => `${t.name}@${t.version ?? '-'}`);
    expect(names).toContain('WordPress@5.8.1');
    expect(names).toContain('contact-form-7@5.4.2');
    expect(names).toContain('twentytwentyone@1.4');
    expect(names).toContain('akismet@-');
    expect(out.technologies.every((t) => t.assetValue === 'blog.example.com')).toBe(true);
  });

  it('emits a MEDIUM finding for the debug log and LOW findings for enumerated users', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    const debug = out.findings.find((f) => f.title.includes('Debug Log'));
    expect(debug?.severity).toBe('MEDIUM');
    expect(debug?.scannerName).toBe('wpscan');
    const users = out.findings.filter((f) => f.title.startsWith('WordPress user enumerated'));
    expect(users.map((u) => u.title)).toEqual([
      'WordPress user enumerated: admin',
      'WordPress user enumerated: editor',
    ]);
    expect(users.every((u) => u.severity === 'LOW')).toBe(true);
  });

  it('returns empty output on malformed JSON', async () => {
    const out = await parser.parse('not json', ctx);
    expect(out.technologies).toHaveLength(0);
    expect(out.findings).toHaveLength(0);
  });
});
