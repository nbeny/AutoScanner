import { OpenvasdJsonParser } from '../openvasd-json';
import type { ParserContext } from '../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'openvas-scan',
  target: '10.0.0.5',
  engagementId: 'e',
};

describe('OpenvasdJsonParser', () => {
  const parser = new OpenvasdJsonParser();

  it('maps an alarm result to a Finding with CVSS-derived severity + CVE', async () => {
    const json = JSON.stringify([
      {
        type: 'alarm',
        ip_address: '10.0.0.5',
        hostname: 'host.test',
        oid: '1.3.6.1.4.1.25623.1.0.123456',
        port: '443/tcp',
        message: 'OpenSSL Heartbleed',
        severity: 9.4,
        refs: [{ type: 'cve', id: 'CVE-2014-0160' }],
      },
      { type: 'host_detail', ip_address: '10.0.0.5', message: 'OS: Linux' },
    ]);
    const out = await parser.parse(json, ctx);
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0].severity).toBe('CRITICAL');
    expect(out.findings[0].location).toContain('443/tcp');
    expect(out.findings[0].cveId).toBe('CVE-2014-0160');
    expect(out.findings[0].title).toContain('Heartbleed');
  });

  it('tolerant of blank/garbage / no-alarm output', async () => {
    expect((await parser.parse('', ctx)).findings).toHaveLength(0);
    expect((await parser.parse('not json', ctx)).findings).toHaveLength(0);
    expect((await parser.parse('[]', ctx)).findings).toHaveLength(0);
  });
});
