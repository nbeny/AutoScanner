import { DnsreconScanner } from '../dnsrecon.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('DnsreconScanner', () => {
  it('pinned image, bridge, no caps, readonlyRootfs', () => {
    expect(DnsreconScanner.docker.image).toBe('autoscanner/dnsrecon:1.0');
    expect(DnsreconScanner.docker.network).toBe('bridge');
    expect(DnsreconScanner.docker.capabilities).toEqual([]);
    expect(DnsreconScanner.docker.readonlyRootfs).toBe(true);
  });

  it('default methods are std,axfr,srv (brt excluded)', () => {
    const input = DnsreconScanner.inputSchema.parse({ domain: 'example.com' });
    const { cmd } = DnsreconScanner.build(input, 'example.com', ctx);
    expect(cmd).toContain('-t');
    const tIdx = cmd.indexOf('-t');
    expect(cmd[tIdx + 1]).toBe('std,axfr,srv');
    expect(cmd).toContain('-d');
    expect(cmd).toContain('example.com');
    expect(cmd).toContain('-j');
    expect(cmd).toContain('/out/result.json');
    expect(cmd).not.toContain('-D');
  });

  it('passes -D with bundled wordlist when brt method ticked', () => {
    const input = DnsreconScanner.inputSchema.parse({
      domain: 'example.com',
      methods: ['std', 'brt'],
    });
    const { cmd } = DnsreconScanner.build(input, 'example.com', ctx);
    const dIdx = cmd.indexOf('-D');
    expect(dIdx).toBeGreaterThan(-1);
    expect(cmd[dIdx + 1]).toBe('/opt/dnsrecon/brute.txt');
  });

  it('passes -n with comma-joined nameservers when provided', () => {
    const input = DnsreconScanner.inputSchema.parse({
      domain: 'example.com',
      nameservers: ['1.1.1.1', '8.8.8.8'],
    });
    const { cmd } = DnsreconScanner.build(input, 'example.com', ctx);
    const nIdx = cmd.indexOf('-n');
    expect(cmd[nIdx + 1]).toBe('1.1.1.1,8.8.8.8');
  });

  it('JSON @ /out/result.json → dnsrecon-json, produces Asset+Finding', () => {
    expect(DnsreconScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: { path: '/out/result.json' },
      parser: 'dnsrecon-json',
    });
    expect(DnsreconScanner.produces).toEqual(['Asset', 'Finding']);
  });
});
