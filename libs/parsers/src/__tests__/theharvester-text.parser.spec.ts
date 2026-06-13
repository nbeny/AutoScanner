import * as fs from 'fs';
import * as path from 'path';
import { TheHarvesterTextParser } from '../theharvester-text/theharvester-text.parser';

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'theharvester-sample.txt'),
  'utf8',
);

const ctx = {
  scanJobId: 'j',
  scannerName: 'theharvester',
  target: 'example.com',
  engagementId: 'e',
};

describe('TheHarvesterTextParser', () => {
  let parser: TheHarvesterTextParser;

  beforeEach(() => {
    parser = new TheHarvesterTextParser();
  });

  it('has name theharvester-text and formats TEXT', () => {
    expect(parser.name).toBe('theharvester-text');
    expect(parser.formats).toEqual(['TEXT']);
  });

  it('extracts exactly 2 emails from the fixture, lowercased and deduped', async () => {
    const out = await parser.parse(fixture, ctx);
    expect(out.emails).toHaveLength(2);
    const addresses = out.emails.map((e) => e.address);
    expect(addresses).toContain('admin@example.com');
    expect(addresses).toContain('info@example.com');
    // All lowercase
    addresses.forEach((a) => expect(a).toBe(a.toLowerCase()));
  });

  it('pushes emails to out.emails (not out.assets)', async () => {
    const out = await parser.parse(fixture, ctx);
    expect(out.assets).toHaveLength(0);
    expect(out.emails.length).toBeGreaterThan(0);
  });

  it('does not produce false positives from noise lines (headers, searching lines)', async () => {
    const out = await parser.parse(fixture, ctx);
    const addresses = out.emails.map((e) => e.address);
    // All entries must contain '@'
    expect(addresses.every((a) => a.includes('@'))).toBe(true);
    // Noise lines like "[*] Searching crtsh..." must not produce emails
    expect(addresses).not.toContain('crtsh');
    expect(addresses).not.toContain('example.com');
  });

  it('returns empty emails for empty input without throwing', async () => {
    const out = await parser.parse('', ctx);
    expect(out.emails).toHaveLength(0);
  });

  it('deduplicates repeated emails', async () => {
    const doubled = fixture + '\nadmin@example.com\n';
    const out = await parser.parse(doubled, ctx);
    const addresses = out.emails.map((e) => e.address);
    const adminCount = addresses.filter((a) => a === 'admin@example.com').length;
    expect(adminCount).toBe(1);
  });
});
