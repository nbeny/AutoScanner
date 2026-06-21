import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NbtscanTextParser } from '../nbtscan-text/nbtscan-text.parser';
import type { ParserContext } from '../types';

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'nbtscan-sample.txt'), 'utf8');
const ctx: ParserContext = { scanJobId: 'j1', scannerName: 'nbtscan', target: '10.0.0.5', engagementId: 'e1' };

describe('NbtscanTextParser', () => {
  const parser = new NbtscanTextParser();

  it('declares name and TEXT format', () => {
    expect(parser.name).toBe('nbtscan-text');
    expect(parser.formats).toEqual(['TEXT']);
  });

  it('emits an Asset with hostname and an INFO finding', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    expect(out.assets).toHaveLength(1);
    expect(out.assets[0]).toMatchObject({ type: 'IP', value: '10.0.0.5' });
    expect(out.assets[0].hostnames).toContain('DC01');
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0].severity).toBe('INFO');
    expect(out.findings[0].title).toContain('NetBIOS');
  });

  it('returns empty output on blank input', async () => {
    const out = await parser.parse('', ctx);
    expect(out.assets).toHaveLength(0);
  });
});
