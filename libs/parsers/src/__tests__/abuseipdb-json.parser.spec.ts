import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AbuseipdbJsonParser } from '../abuseipdb-json/abuseipdb-json.parser';
import type { ParserContext } from '../types';

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'abuseipdb-sample.json'), 'utf8');
const ctx: ParserContext = { scanJobId: 'j1', scannerName: 'abuseipdb', target: '1.2.3.4', engagementId: 'e1' };

describe('AbuseipdbJsonParser', () => {
  const parser = new AbuseipdbJsonParser();

  it('declares name and JSON format', () => {
    expect(parser.name).toBe('abuseipdb-json');
    expect(parser.formats).toEqual(['JSON']);
  });

  it('emits HIGH finding for score ≥ 75', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0].severity).toBe('HIGH');
    expect(out.findings[0].title).toContain('1.2.3.4');
    expect((out.findings[0].evidence as { score: number }).score).toBe(82);
  });

  it('emits MEDIUM finding for score 25–74', async () => {
    const payload = JSON.stringify({ data: { ipAddress: '5.6.7.8', abuseConfidenceScore: 50, totalReports: 10 } });
    const out = await parser.parse(payload, ctx);
    expect(out.findings[0].severity).toBe('MEDIUM');
  });

  it('emits INFO finding for score 1–24', async () => {
    const payload = JSON.stringify({ data: { ipAddress: '5.6.7.8', abuseConfidenceScore: 5, totalReports: 1 } });
    const out = await parser.parse(payload, ctx);
    expect(out.findings[0].severity).toBe('INFO');
  });

  it('emits no finding for score 0', async () => {
    const payload = JSON.stringify({ data: { ipAddress: '9.9.9.9', abuseConfidenceScore: 0, totalReports: 0 } });
    const out = await parser.parse(payload, ctx);
    expect(out.findings).toHaveLength(0);
  });

  it('returns empty output on blank input', async () => {
    const out = await parser.parse('', ctx);
    expect(out.findings).toHaveLength(0);
  });
});
