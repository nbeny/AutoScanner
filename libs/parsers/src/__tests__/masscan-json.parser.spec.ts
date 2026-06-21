import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MasscanJsonParser } from '../masscan-json/masscan-json.parser';
import type { ParserContext } from '../types';

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'masscan-sample.json'), 'utf8');
const ctx: ParserContext = { scanJobId: 'j1', scannerName: 'masscan', target: '10.0.0.5', engagementId: 'e1' };

describe('MasscanJsonParser', () => {
  const parser = new MasscanJsonParser();

  it('declares name and JSON format', () => {
    expect(parser.name).toBe('masscan-json');
    expect(parser.formats).toEqual(['JSON']);
  });

  it('parses 3 open ports from fixture', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    expect(out.ports).toHaveLength(3);
    expect(out.ports[0]).toMatchObject({ assetValue: '10.0.0.5', number: 22, protocol: 'TCP', state: 'OPEN' });
    expect(out.ports[1]).toMatchObject({ assetValue: '10.0.0.5', number: 80, protocol: 'TCP', state: 'OPEN' });
    expect(out.ports[2]).toMatchObject({ assetValue: '10.0.0.5', number: 8080, protocol: 'TCP', state: 'OPEN' });
    expect(out.findings).toHaveLength(0);
  });

  it('returns empty output on empty input', async () => {
    const out = await parser.parse('', ctx);
    expect(out.ports).toHaveLength(0);
  });

  it('returns empty output on invalid JSON', async () => {
    const out = await parser.parse('not-json', ctx);
    expect(out.ports).toHaveLength(0);
  });
});
