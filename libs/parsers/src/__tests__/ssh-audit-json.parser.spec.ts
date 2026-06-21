import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SshAuditJsonParser } from '../ssh-audit-json/ssh-audit-json.parser';
import type { ParserContext } from '../types';

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'ssh-audit-sample.json'), 'utf8');
const ctx: ParserContext = { scanJobId: 'j1', scannerName: 'ssh-audit', target: '10.0.0.1', engagementId: 'e1' };

describe('SshAuditJsonParser', () => {
  const parser = new SshAuditJsonParser();

  it('declares name and JSON format', () => {
    expect(parser.name).toBe('ssh-audit-json');
    expect(parser.formats).toEqual(['JSON']);
  });

  it('emits HIGH findings for fail-rated algorithms', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    const high = out.findings.filter(f => f.severity === 'HIGH');
    expect(high.length).toBeGreaterThanOrEqual(3);
    const titles = high.map(f => f.title);
    expect(titles.some(t => t.includes('diffie-hellman-group1-sha1'))).toBe(true);
    expect(titles.some(t => t.includes('ssh-rsa'))).toBe(true);
    expect(titles.some(t => t.includes('hmac-md5'))).toBe(true);
  });

  it('emits INFO finding for SSH banner exposure', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    const info = out.findings.filter(f => f.severity === 'INFO');
    expect(info.some(f => f.title.includes('banner'))).toBe(true);
  });

  it('returns empty output on empty input', async () => {
    const out = await parser.parse('', ctx);
    expect(out.findings).toHaveLength(0);
  });
});
