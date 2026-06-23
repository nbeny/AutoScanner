import { DnstwistJsonParser } from '../dnstwist-json.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'dnstwist',
  target: 'example.com',
  engagementId: 'e',
};

const SAMPLE = JSON.stringify([
  { domain: 'example.com', fuzzer: 'original*', dns_a: ['1.2.3.4'] },
  { domain: 'examp1e.com', fuzzer: 'replacement', dns_a: ['5.6.7.8'] },
  {
    domain: 'exampel.com',
    fuzzer: 'transposition',
    dns_a: ['9.9.9.9'],
    dns_mx: ['mx.exampel.com'],
  },
]);

describe('DnstwistJsonParser', () => {
  it('emits a DOMAIN asset + a MEDIUM finding per registered lookalike, skipping the original', async () => {
    const out = await new DnstwistJsonParser().parse(SAMPLE, ctx);
    const values = out.assets.map((a) => a.value).sort();
    expect(values).toEqual(['examp1e.com', 'exampel.com']);
    expect(out.assets.every((a) => a.type === 'DOMAIN')).toBe(true);
    expect(out.findings).toHaveLength(2);
    expect(out.findings[0]).toMatchObject({
      scannerName: 'dnstwist',
      severity: 'MEDIUM',
    });
    expect(out.findings[0].title).toContain('typosquat');
  });

  it('returns empty output for blank or non-array input', async () => {
    expect((await new DnstwistJsonParser().parse('', ctx)).assets).toHaveLength(0);
    expect((await new DnstwistJsonParser().parse('{}', ctx)).findings).toHaveLength(0);
  });
});
