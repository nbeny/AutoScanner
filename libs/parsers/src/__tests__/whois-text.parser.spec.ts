import * as fs from 'fs';
import * as path from 'path';
import { WhoisTextParser } from '../whois-text/whois-text.parser';

const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'whois-sample.txt'), 'utf8');

const ctx = {
  scanJobId: 'j',
  scannerName: 'whois',
  target: 'example.com',
  engagementId: 'e',
};

describe('WhoisTextParser', () => {
  let parser: WhoisTextParser;

  beforeEach(() => {
    parser = new WhoisTextParser();
  });

  it('has name whois-text and formats TEXT', () => {
    expect(parser.name).toBe('whois-text');
    expect(parser.formats).toEqual(['TEXT']);
  });

  it('extracts emails lowercased and deduped', async () => {
    const out = await parser.parse(fixture, ctx);
    const addresses = out.emails.map((e) => e.address);
    // admin@example.com appears twice (Registrant + Tech) — must be deduped
    expect(addresses).toContain('admin@example.com');
    expect(addresses).toContain('hostmaster@example.com');
    expect(addresses).toContain('abuse@example-registrar.com');
    // Exactly 3 unique addresses
    expect(addresses.length).toBe(3);
    // All must be lowercase
    addresses.forEach((a) => expect(a).toBe(a.toLowerCase()));
  });

  it('does not emit false-positive emails from non-email lines', async () => {
    const out = await parser.parse(fixture, ctx);
    // Lines like "Name Server: NS1.EXAMPLE.COM" must not produce email entries
    const addresses = out.emails.map((e) => e.address);
    expect(addresses.every((a) => a.includes('@'))).toBe(true);
  });

  it('produces exactly one WHOIS orgMetadata entry with key/value data', async () => {
    const out = await parser.parse(fixture, ctx);
    expect(out.orgMetadata).toHaveLength(1);
    const [meta] = out.orgMetadata;
    expect(meta.kind).toBe('WHOIS');
    const data = meta.data as Record<string, string>;
    expect(data['Registrant Organization']).toBe('Example Inc.');
    expect(data['Registrar']).toBe('Example Registrar, LLC');
  });

  it('returns empty emails and orgMetadata for empty input without throwing', async () => {
    const out = await parser.parse('', ctx);
    expect(out.emails).toHaveLength(0);
    expect(out.orgMetadata).toHaveLength(0);
  });
});
