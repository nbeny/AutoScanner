import { IkeScanTextParser } from '../ike-scan-text/ike-scan-text.parser';
import type { ParserContext } from '../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'ike-scan',
  target: '1.1.1.1',
  engagementId: 'e',
};

describe('IkeScanTextParser', () => {
  const parser = new IkeScanTextParser();

  it('emits Service UDP/500 and LOW fingerprint finding on main-mode handshake', async () => {
    const text = [
      'Starting ike-scan 1.9.5',
      '1.1.1.1\tMain Mode Handshake returned HDR=(CKY-R=abc) SA=(Enc=3DES Hash=SHA1 Group=2:modp1024 Auth=PSK LifeType=Seconds LifeDuration=28800)',
    ].join('\n');
    const out = await parser.parse(text, ctx);
    expect(out.services).toEqual([
      { assetValue: '1.1.1.1', portNumber: 500, protocol: 'UDP', name: 'isakmp' },
    ]);
    expect(out.findings.some((f) => f.severity === 'LOW' && /IKE/i.test(f.title))).toBe(true);
  });

  it('emits MEDIUM finding on aggressive mode + PSK transform', async () => {
    const text =
      '1.1.1.1\tAggressive Mode Handshake returned HDR=(CKY-R=xyz) SA=(Enc=AES Hash=SHA1 Auth=PSK)';
    const out = await parser.parse(text, ctx);
    expect(
      out.findings.some(
        (f) => f.severity === 'MEDIUM' && /aggressive/i.test(f.title) && /PSK/i.test(f.title),
      ),
    ).toBe(true);
  });

  it('returns empty on blank input', async () => {
    const out = await parser.parse('', ctx);
    expect(out.services).toHaveLength(0);
  });
});
