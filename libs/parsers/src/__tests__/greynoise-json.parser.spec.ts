import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GreynoiseJsonParser } from '../greynoise-json/greynoise-json.parser';
import type { ParserContext } from '../types';

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'greynoise-sample.json'), 'utf8');
const ctx: ParserContext = { scanJobId: 'j1', scannerName: 'greynoise', target: '1.2.3.4', engagementId: 'e1' };

describe('GreynoiseJsonParser', () => {
  const parser = new GreynoiseJsonParser();

  it('declares name and JSON format', () => {
    expect(parser.name).toBe('greynoise-json');
    expect(parser.formats).toEqual(['JSON']);
  });

  it('emits CRITICAL finding when classification is malicious', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0].severity).toBe('CRITICAL');
    expect(out.findings[0].title).toContain('malicious');
  });

  it('emits MEDIUM finding for noisy non-malicious scanner', async () => {
    const payload = JSON.stringify({ ip: '5.6.7.8', noise: true, riot: false, classification: 'benign', message: 'Success' });
    const out = await parser.parse(payload, ctx);
    expect(out.findings[0].severity).toBe('MEDIUM');
  });

  it('emits INFO finding for RIOT (benign service)', async () => {
    const payload = JSON.stringify({ ip: '8.8.8.8', noise: false, riot: true, name: 'Google LLC', message: 'Success' });
    const out = await parser.parse(payload, ctx);
    expect(out.findings[0].severity).toBe('INFO');
  });

  it('emits no finding when IP is unknown to GreyNoise', async () => {
    const payload = JSON.stringify({ ip: '1.2.3.4', noise: false, riot: false, message: 'not found' });
    const out = await parser.parse(payload, ctx);
    expect(out.findings).toHaveLength(0);
  });

  it('returns empty output on blank input', async () => {
    const out = await parser.parse('', ctx);
    expect(out.findings).toHaveLength(0);
  });
});
