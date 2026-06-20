import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NiktoJsonParser } from '../nikto-json/nikto-json.parser';
import type { ParserContext } from '../types';

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'nikto-sample.json'), 'utf8');
const ctx: ParserContext = {
  scanJobId: 'job_1',
  scannerName: 'nikto',
  target: 'example.com',
  engagementId: 'eng_1',
};

describe('NiktoJsonParser', () => {
  const parser = new NiktoJsonParser();

  it('declares name and formats', () => {
    expect(parser.name).toBe('nikto-json');
    expect(parser.formats).toEqual(['JSON']);
  });

  it('maps each vulnerability to a finding with the message as title', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    expect(out.findings).toHaveLength(2);
    const header = out.findings.find((f) => f.title.includes('X-Frame-Options'));
    expect(header?.severity).toBe('INFO');
    expect(header?.scannerName).toBe('nikto');
    expect(header?.location).toBe('/');
  });

  it('bumps known dangerous patterns to MEDIUM', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    const git = out.findings.find((f) => f.location === '/.git/HEAD');
    expect(git?.severity).toBe('MEDIUM');
  });

  it('returns empty output on malformed JSON', async () => {
    const out = await parser.parse('nope', ctx);
    expect(out.findings).toHaveLength(0);
  });
});
