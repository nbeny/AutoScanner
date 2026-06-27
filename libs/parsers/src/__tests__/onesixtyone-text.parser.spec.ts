import { OnesixtyoneTextParser } from '../onesixtyone-text/onesixtyone-text.parser';
import type { ParserContext } from '../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'onesixtyone',
  target: '10.0.0.1',
  engagementId: 'e',
};

describe('OnesixtyoneTextParser', () => {
  const parser = new OnesixtyoneTextParser();

  it('emits a Service (UDP/161 snmp) and a MEDIUM finding for weak community "public"', async () => {
    const text = '10.0.0.1 [public] Linux router 5.10';
    const out = await parser.parse(text, ctx);
    expect(out.services).toEqual([
      {
        assetValue: '10.0.0.1',
        portNumber: 161,
        protocol: 'UDP',
        name: 'snmp',
        extraInfo: 'Linux router 5.10',
      },
    ]);
    expect(out.findings[0]).toMatchObject({
      severity: 'MEDIUM',
      title: expect.stringMatching(/weak SNMP community/i),
      location: '10.0.0.1',
    });
  });

  it('does NOT emit a finding for a community outside the default-weak set', async () => {
    const text = '10.0.0.1 [my-custom-community-xyz] Linux router 5.10';
    const out = await parser.parse(text, ctx);
    expect(out.services).toHaveLength(1);
    expect(out.findings).toHaveLength(0);
  });

  it('returns empty on blank input', async () => {
    const out = await parser.parse('', ctx);
    expect(out.services).toHaveLength(0);
    expect(out.findings).toHaveLength(0);
  });
});
