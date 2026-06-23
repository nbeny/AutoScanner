import { SpiderfootJsonParser } from '../spiderfoot-json/spiderfoot-json.parser';
import type { ParserContext } from '../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'spiderfoot',
  target: 'example.com',
  engagementId: 'e',
};

describe('SpiderfootJsonParser', () => {
  const parser = new SpiderfootJsonParser();

  it('declares name and JSON format', () => {
    expect(parser.name).toBe('spiderfoot-json');
    expect(parser.formats).toEqual(['JSON']);
  });

  it('fans events out into emails, IPs, subdomains and findings', async () => {
    const payload = JSON.stringify([
      { type: 'EMAILADDR', data: 'admin@example.com', module: 'sfp_email' },
      { type: 'IP_ADDRESS', data: '93.184.216.34', module: 'sfp_dnsresolve' },
      { type: 'INTERNET_NAME', data: 'WWW.Example.com', module: 'sfp_dnsresolve' },
      { type: 'VULNERABILITY_GENERAL', data: 'CVE-2021-0001 on host', module: 'sfp_x' },
      { type: 'RAW_RIR_DATA', data: 'noise', module: 'sfp_x' },
    ]);
    const out = await parser.parse(payload, ctx);

    expect(out.emails.map((e) => e.address)).toEqual(['admin@example.com']);
    expect(out.assets.filter((a) => a.type === 'IP').map((a) => a.value)).toEqual([
      '93.184.216.34',
    ]);
    expect(out.assets.filter((a) => a.type === 'SUBDOMAIN').map((a) => a.value)).toEqual([
      'www.example.com',
    ]);
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0].severity).toBe('HIGH');
    expect(out.findings[0].scannerName).toBe('spiderfoot');
    expect(out.findings[0].title).toContain('VULNERABILITY_GENERAL');
  });

  it('returns empty output on blank or non-array input', async () => {
    expect((await parser.parse('', ctx)).assets).toHaveLength(0);
    expect((await parser.parse('not json', ctx)).assets).toHaveLength(0);
    expect((await parser.parse('{}', ctx)).assets).toHaveLength(0);
  });
});
