import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ArjunJsonParser } from '../arjun-json/arjun-json.parser';
import type { ParserContext } from '../types';

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'arjun-sample.json'), 'utf8');
const ctx: ParserContext = {
  scanJobId: 'job_1',
  scannerName: 'arjun',
  target: 'http://example.com/search.php',
  engagementId: 'eng_1',
};

describe('ArjunJsonParser', () => {
  const parser = new ArjunJsonParser();

  it('declares name and formats', () => {
    expect(parser.name).toBe('arjun-json');
    expect(parser.formats).toEqual(['JSON']);
  });

  it('emits one INFO finding per URL with discovered params, skipping empties', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    expect(out.findings).toHaveLength(1);
    const f = out.findings[0];
    expect(f.scannerName).toBe('arjun');
    expect(f.severity).toBe('INFO');
    expect(f.title).toBe('Hidden HTTP parameters discovered (3)');
    expect(f.location).toBe('http://example.com/search.php');
    expect(f.evidence).toEqual({ params: ['q', 'category', 'debug'] });
  });

  it('handles the object-shaped arjun output ({ params: [...] })', async () => {
    const out = await parser.parse(JSON.stringify({ 'http://x/': { params: ['a', 'b'] } }), ctx);
    expect(out.findings[0].title).toBe('Hidden HTTP parameters discovered (2)');
  });

  it('returns empty output on malformed JSON', async () => {
    const out = await parser.parse('xxx', ctx);
    expect(out.findings).toHaveLength(0);
  });
});
