import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DnsxJsonParser } from '../dnsx-json/dnsx-json.parser';
import type { ParserContext } from '../types';

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'dnsx-hackerone.jsonl'), 'utf8');

const ctx: ParserContext = {
  scanJobId: 'job_1',
  scannerName: 'dnsx',
  target: 'hackerone.com',
  engagementId: 'eng_1',
};

describe('DnsxJsonParser', () => {
  const parser = new DnsxJsonParser();

  it('declares name and supported formats', () => {
    expect(parser.name).toBe('dnsx-json');
    expect(parser.formats).toEqual(['JSONL']);
  });

  it('emits IP assets (type IP) for each A and AAAA address', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    const ipAssets = out.assets.filter((a) => a.type === 'IP');
    // www: 2×A + 2×AAAA = 4, api: 1×A = 1, mta-sts: 1×A = 1, docs: 1×A = 1 → total 7
    expect(ipAssets.length).toBe(7);
    const values = ipAssets.map((a) => a.value);
    expect(values).toContain('104.16.99.52');
    expect(values).toContain('104.16.100.52');
    expect(values).toContain('2606:4700::6810:6334');
    expect(values).toContain('2606:4700::6810:6434');
  });

  it('does not emit SUBDOMAIN assets', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    expect(out.assets.every((a) => a.type !== 'SUBDOMAIN')).toBe(true);
  });

  it('emits DnsRecord entries for A records', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    const aRecords = out.dnsRecords.filter((r) => r.recordType === 'A');
    // www: 2, api: 1, mta-sts: 1, docs: 1 = 5
    expect(aRecords.length).toBe(5);
    expect(
      aRecords.some((r) => r.assetValue === 'www.hackerone.com' && r.value === '104.16.99.52'),
    ).toBe(true);
  });

  it('emits DnsRecord entries for AAAA records', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    const aaaaRecords = out.dnsRecords.filter((r) => r.recordType === 'AAAA');
    // www: 2
    expect(aaaaRecords.length).toBe(2);
    expect(
      aaaaRecords.some(
        (r) => r.assetValue === 'www.hackerone.com' && r.value === '2606:4700::6810:6334',
      ),
    ).toBe(true);
  });

  it('emits DnsRecord entries for CNAME records', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    const cnameRecords = out.dnsRecords.filter((r) => r.recordType === 'CNAME');
    // www: 1, api: 1, mta-sts: 1 = 3
    expect(cnameRecords.length).toBe(3);
    expect(
      cnameRecords.some(
        (r) =>
          r.assetValue === 'www.hackerone.com' &&
          r.value === 'www.hackerone.com.cdn.cloudflare.net',
      ),
    ).toBe(true);
  });

  it('emits DnsRecord entries for MX records', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    const mxRecords = out.dnsRecords.filter((r) => r.recordType === 'MX');
    // smtp: 1
    expect(mxRecords.length).toBe(1);
    expect(mxRecords[0].assetValue).toBe('smtp.hackerone.com');
    expect(mxRecords[0].value).toBe('smtp.hackerone.com');
  });

  it('lowercases host and IP values, strips trailing dots', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    for (const asset of out.assets) {
      expect(asset.value).toBe(asset.value.toLowerCase());
      expect(asset.value.endsWith('.')).toBe(false);
    }
    for (const record of out.dnsRecords) {
      expect(record.assetValue).toBe(record.assetValue.toLowerCase());
      expect(record.assetValue.endsWith('.')).toBe(false);
      expect(record.value).toBe(record.value.toLowerCase());
      expect(record.value.endsWith('.')).toBe(false);
    }
  });

  it('skips lines with no host without throwing', async () => {
    const input = [
      '{"a":["1.2.3.4"]}',
      '{"host":"","a":["1.2.3.4"]}',
      '{"host":"sub.example.com","a":["5.6.7.8"]}',
      '',
    ].join('\n');
    const out = await parser.parse(input, ctx);
    // Only one valid host emits assets
    expect(out.assets.length).toBe(1);
    expect(out.assets[0].value).toBe('5.6.7.8');
  });

  it('skips malformed JSON lines without throwing', async () => {
    const input = 'not-json\n{"host":"ok.example.com","a":["1.1.1.1"]}';
    const out = await parser.parse(input, ctx);
    expect(out.assets.length).toBe(1);
  });

  it('accepts Buffer input', async () => {
    const out = await parser.parse(Buffer.from(FIXTURE, 'utf8'), ctx);
    expect(out.assets.length).toBeGreaterThan(0);
    expect(out.dnsRecords.length).toBeGreaterThan(0);
  });

  it('returns empty NormalizedOutput for empty input', async () => {
    const out = await parser.parse('', ctx);
    expect(out.assets).toEqual([]);
    expect(out.dnsRecords).toEqual([]);
  });
});
