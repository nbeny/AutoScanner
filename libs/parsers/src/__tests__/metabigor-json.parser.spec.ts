import { MetabigorJsonParser } from '../metabigor-json/metabigor-json.parser';
import type { ParserContext } from '../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'metabigor',
  target: 'Example Inc',
  engagementId: 'e',
};

describe('MetabigorJsonParser', () => {
  const parser = new MetabigorJsonParser();

  it('declares name and JSONL format', () => {
    expect(parser.name).toBe('metabigor-json');
    expect(parser.formats).toEqual(['JSONL']);
  });

  it('emits a NETBLOCK asset + ASN orgMetadata per JSON line', async () => {
    const payload = [
      JSON.stringify({
        Number: 'AS123',
        Description: 'Example Inc',
        Country: 'US',
        Subnet: '1.2.3.0/24',
      }),
      JSON.stringify({
        Number: 'AS123',
        Description: 'Example Inc',
        Country: 'US',
        Subnet: '5.6.0.0/16',
      }),
    ].join('\n');
    const out = await parser.parse(payload, ctx);
    const netblocks = out.assets.filter((a) => a.type === 'NETBLOCK').map((a) => a.value);
    expect(netblocks).toEqual(expect.arrayContaining(['1.2.3.0/24', '5.6.0.0/16']));
    expect(out.orgMetadata.length).toBeGreaterThanOrEqual(1);
    expect(out.orgMetadata[0].kind).toBe('ASN');
  });

  it('falls back to CIDR regex on non-JSON lines', async () => {
    const out = await parser.parse('10.0.0.0/8\n# comment\n', ctx);
    expect(out.assets.filter((a) => a.type === 'NETBLOCK').map((a) => a.value)).toEqual([
      '10.0.0.0/8',
    ]);
  });

  it('returns empty output on blank input', async () => {
    expect((await parser.parse('', ctx)).assets).toHaveLength(0);
  });
});
