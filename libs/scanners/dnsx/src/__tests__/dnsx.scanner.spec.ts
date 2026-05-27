import { DnsxScanner } from '../dnsx.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = {
  scanJobId: 'job_1',
  engagementId: 'eng_1',
  scratchDir: '/tmp/scratch',
};

describe('DnsxScanner', () => {
  it('declares name, docker, outputs, produces per spec', () => {
    expect(DnsxScanner.name).toBe('dnsx');
    expect(DnsxScanner.displayName).toBe('dnsx');
    expect(DnsxScanner.docker.image).toBe('projectdiscovery/dnsx:latest');
    expect(DnsxScanner.docker.network).toBe('bridge');
    expect(DnsxScanner.docker.capabilities).toEqual([]);
    expect(DnsxScanner.docker.readonlyRootfs).toBe(true);
    expect(DnsxScanner.docker.memoryLimitMb).toBe(512);
    expect(DnsxScanner.docker.cpuQuota).toBe(1_000_000);
    expect(DnsxScanner.docker.defaultTimeoutMs).toBe(600_000);
    expect(DnsxScanner.outputs[0]).toEqual({
      format: 'JSONL',
      capture: 'stdout',
      parser: 'dnsx-json',
    });
    expect(DnsxScanner.produces).toContain('Asset');
    expect(DnsxScanner.produces).toContain('IpAddress');
    expect(DnsxScanner.produces).toContain('DnsRecord');
  });

  it('inputSchema applies defaults (all four record types)', () => {
    const parsed = DnsxScanner.inputSchema.parse({});
    expect(parsed).toMatchObject({
      recordTypes: ['A', 'AAAA', 'CNAME', 'MX'],
    });
  });

  it('inputSchema accepts a subset of record types', () => {
    const parsed = DnsxScanner.inputSchema.parse({ recordTypes: ['A', 'AAAA'] });
    expect(parsed.recordTypes).toEqual(['A', 'AAAA']);
  });

  it('inputSchema rejects unknown record types', () => {
    expect(() => DnsxScanner.inputSchema.parse({ recordTypes: ['TXT'] })).toThrow();
  });

  it('build() returns the fixed dnsx command with -silent -json -resp flags', () => {
    const input = DnsxScanner.inputSchema.parse({});
    const result = DnsxScanner.build(input, 'www.hackerone.com', ctx);
    expect(result.cmd[0]).toBe('dnsx');
    expect(result.cmd).toContain('-silent');
    expect(result.cmd).toContain('-json');
    expect(result.cmd).toContain('-resp');
    expect(result.cmd).toContain('-a');
    expect(result.cmd).toContain('-aaaa');
    expect(result.cmd).toContain('-cname');
    expect(result.cmd).toContain('-mx');
  });

  it('build() passes target via stdin, not as a CLI arg', () => {
    const input = DnsxScanner.inputSchema.parse({});
    const result = DnsxScanner.build(input, 'hackerone.com', ctx);
    expect(result.stdin).toBe('hackerone.com');
    // Target must NOT appear as a -d or positional arg in the cmd array.
    expect(result.cmd).not.toContain('hackerone.com');
  });
});
