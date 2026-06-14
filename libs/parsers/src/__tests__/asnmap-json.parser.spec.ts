import { AsnmapJsonParser } from '../asnmap-json';
import type { ParserContext } from '../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'asnmap',
  target: 'example.com',
  engagementId: 'e',
};

describe('AsnmapJsonParser', () => {
  const parser = new AsnmapJsonParser();

  it('parses JSONL into one ASN OrgMetadata with collected CIDRs', async () => {
    const input = [
      JSON.stringify({
        as_number: 'AS15169',
        as_name: 'GOOGLE',
        as_country: 'US',
        as_range: ['8.8.8.0/24'],
      }),
      JSON.stringify({
        as_number: 'AS15169',
        as_name: 'GOOGLE',
        as_country: 'US',
        as_range: ['8.34.208.0/20'],
      }),
    ].join('\n');
    const out = await parser.parse(input, ctx);
    expect(out.orgMetadata).toHaveLength(1);
    expect(out.orgMetadata[0].kind).toBe('ASN');
    const data = out.orgMetadata[0].data as { asn: string; cidrs: string[] };
    expect(data.asn).toBe('AS15169');
    expect(data.cidrs).toEqual(expect.arrayContaining(['8.8.8.0/24', '8.34.208.0/20']));
  });

  it('returns empty output on blank/garbage input', async () => {
    expect((await parser.parse('', ctx)).orgMetadata).toHaveLength(0);
    expect((await parser.parse('not json\n{bad', ctx)).orgMetadata).toHaveLength(0);
  });
});
