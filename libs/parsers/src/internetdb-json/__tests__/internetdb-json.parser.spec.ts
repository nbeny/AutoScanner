import { InternetdbJsonParser } from '../internetdb-json.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'internetdb',
  target: '1.1.1.1',
  engagementId: 'e',
};

describe('InternetdbJsonParser', () => {
  it('maps ports to OPEN TCP and vulns to CVE findings', async () => {
    const sample = [
      JSON.stringify({
        ip: '1.1.1.1',
        ports: [22, 443],
        hostnames: ['one.one'],
        vulns: ['CVE-2021-1234'],
      }),
      JSON.stringify({ detail: 'No information available' }),
    ].join('\n');
    const out = await new InternetdbJsonParser().parse(sample, ctx);
    expect(out.ports).toHaveLength(2);
    expect(out.ports[0]).toMatchObject({
      assetValue: '1.1.1.1',
      number: 22,
      protocol: 'TCP',
      state: 'OPEN',
    });
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0]).toMatchObject({
      cveId: 'CVE-2021-1234',
      location: '1.1.1.1',
      severity: 'MEDIUM',
    });
    expect(out.assets).toHaveLength(1);
  });

  it('skips no-data records', async () => {
    const out = await new InternetdbJsonParser().parse(
      '{"detail":"No information available"}',
      ctx,
    );
    expect(out.ports).toHaveLength(0);
    expect(out.findings).toHaveLength(0);
  });
});
