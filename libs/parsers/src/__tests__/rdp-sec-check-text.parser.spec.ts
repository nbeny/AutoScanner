import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RdpSecCheckTextParser } from '../rdp-sec-check-text/rdp-sec-check-text.parser';
import type { ParserContext } from '../types';

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'rdp-sec-check-sample.txt'), 'utf8');
const ctx: ParserContext = { scanJobId: 'j1', scannerName: 'rdp-sec-check', target: '10.0.0.5', engagementId: 'e1' };

describe('RdpSecCheckTextParser', () => {
  const parser = new RdpSecCheckTextParser();

  it('declares name and TEXT format', () => {
    expect(parser.name).toBe('rdp-sec-check-text');
    expect(parser.formats).toEqual(['TEXT']);
  });

  it('emits HIGH finding when NLA is not enforced', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    const high = out.findings.filter(f => f.severity === 'HIGH');
    expect(high.length).toBeGreaterThanOrEqual(1);
    expect(high.some(f => f.title.toLowerCase().includes('nla'))).toBe(true);
  });

  it('emits MEDIUM finding for MEDIUM encryption level', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    const medium = out.findings.filter(f => f.severity === 'MEDIUM');
    expect(medium.some(f => f.title.toLowerCase().includes('encryption'))).toBe(true);
  });

  it('returns empty output on blank input', async () => {
    const out = await parser.parse('', ctx);
    expect(out.findings).toHaveLength(0);
  });
});
