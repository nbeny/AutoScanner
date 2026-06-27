import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DnsreconJsonParser } from '../dnsrecon-json/dnsrecon-json.parser';
import type { ParserContext } from '../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'dnsrecon',
  target: 'example.com',
  engagementId: 'e',
};

const SAMPLE = readFileSync(join(__dirname, 'fixtures', 'dnsrecon-sample.json'), 'utf8');

describe('DnsreconJsonParser', () => {
  const parser = new DnsreconJsonParser();

  it('extracts subdomains and IPs as Assets', async () => {
    const out = await parser.parse(SAMPLE, ctx);
    const values = out.assets.map((a) => a.value);
    expect(values).toEqual(
      expect.arrayContaining([
        'www.example.com',
        'mail.example.com',
        'ns1.example.com',
        'ldap.example.com',
        '93.184.216.34',
      ]),
    );
  });

  it('emits a HIGH finding when AXFR succeeded', async () => {
    const out = await parser.parse(SAMPLE, ctx);
    expect(
      out.findings.some(
        (f) =>
          f.severity === 'HIGH' &&
          /zone transfer/i.test(f.title) &&
          /ns1\.example\.com/.test(f.description ?? ''),
      ),
    ).toBe(true);
  });

  it('does NOT emit an AXFR finding when zone_transfer is "failed"', async () => {
    const out = await parser.parse(
      '[{"type":"AXFR","zone_transfer":"failed","ns_server":"ns1.example.com"}]',
      ctx,
    );
    expect(out.findings).toHaveLength(0);
  });

  it('returns empty on blank input', async () => {
    const out = await parser.parse('', ctx);
    expect(out.assets).toHaveLength(0);
  });

  it('tolerates malformed JSON', async () => {
    const out = await parser.parse('not json', ctx);
    expect(out.assets).toHaveLength(0);
    expect(out.findings).toHaveLength(0);
  });
});
