import { SnmpTextParser } from '../snmp-text';
import type { ParserContext } from '../types';
const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'snmp-recon',
  target: '10.0.0.1',
  engagementId: 'e',
};
describe('SnmpTextParser', () => {
  const parser = new SnmpTextParser();
  it('emits a MEDIUM Finding for a readable community + OrgMetadata for sysDescr', async () => {
    const text = [
      '10.0.0.1 [public] Linux router 5.10 #1 SMP',
      'iso.3.6.1.2.1.1.1.0 = STRING: "Linux router 5.10 #1 SMP x86_64"',
    ].join('\n');
    const out = await parser.parse(text, ctx);
    expect(out.findings.some((f) => f.severity === 'MEDIUM' && /community/i.test(f.title))).toBe(
      true,
    );
    expect(out.orgMetadata.some((m) => m.kind === 'OTHER')).toBe(true);
  });
  it('emits OrgMetadata for sysDescr using fully-numeric OID form (1.3.6.1...)', async () => {
    const text = '1.3.6.1.2.1.1.1.0 = STRING: "Cisco IOS Software"';
    const out = await parser.parse(text, ctx);
    expect(out.orgMetadata.some((m) => m.kind === 'OTHER')).toBe(true);
  });
  it('tolerant of blank/garbage', async () => {
    expect((await parser.parse('', ctx)).findings).toHaveLength(0);
  });
});
