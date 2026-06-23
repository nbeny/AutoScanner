import { DnstwistScanner } from '../dnstwist.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('DnstwistScanner', () => {
  it('declares name, image, JSON stdout → dnstwist-json, produces Asset+Finding', () => {
    expect(DnstwistScanner.name).toBe('dnstwist');
    expect(DnstwistScanner.docker.image).toBe('autoscanner/dnstwist:1.0');
    expect(DnstwistScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: 'stdout',
      parser: 'dnstwist-json',
    });
    expect(DnstwistScanner.produces).toEqual(['Asset', 'Finding']);
  });

  it('build() runs dnstwist with json format and --registered by default', () => {
    const { cmd } = DnstwistScanner.build(
      DnstwistScanner.inputSchema.parse({}),
      'example.com',
      ctx,
    );
    expect(cmd[2]).toContain('dnstwist');
    expect(cmd[2]).toContain('--format json');
    expect(cmd[2]).toContain('--registered');
    expect(cmd[2]).toContain("'example.com'");
    expect(cmd[2]).not.toContain('--mxcheck');
  });

  it('build() adds --mxcheck when mxCheck is set, omits --registered when registeredOnly=false', () => {
    const input = DnstwistScanner.inputSchema.parse({ mxCheck: true, registeredOnly: false });
    const { cmd } = DnstwistScanner.build(input, 'example.com', ctx);
    expect(cmd[2]).toContain('--mxcheck');
    expect(cmd[2]).not.toContain('--registered');
  });
});
