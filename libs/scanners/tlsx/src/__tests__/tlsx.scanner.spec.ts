import { TlsxScanner } from '../tlsx.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = {
  scanJobId: 'job_1',
  engagementId: 'eng_1',
  scratchDir: '/tmp/scratch',
};

describe('TlsxScanner', () => {
  it('declares name, displayName, image, outputs, produces per spec', () => {
    expect(TlsxScanner.name).toBe('tlsx');
    expect(TlsxScanner.displayName).toBe('tlsx');
    expect(TlsxScanner.docker.image).toBe('projectdiscovery/tlsx:latest');
    expect(TlsxScanner.docker.network).toBe('bridge');
    expect(TlsxScanner.docker.capabilities).toEqual([]);
    expect(TlsxScanner.docker.readonlyRootfs).toBe(true);
    expect(TlsxScanner.docker.memoryLimitMb).toBe(512);
    expect(TlsxScanner.docker.cpuQuota).toBe(1_000_000);
    expect(TlsxScanner.docker.defaultTimeoutMs).toBe(300_000);
    expect(TlsxScanner.outputs[0]).toEqual({
      format: 'JSONL',
      capture: 'stdout',
      parser: 'tlsx-json',
    });
    expect(TlsxScanner.produces).toContain('TlsCertificate');
    expect(TlsxScanner.produces).toContain('Finding');
  });

  it('inputSchema accepts empty object', () => {
    const parsed = TlsxScanner.inputSchema.parse({});
    expect(parsed).toEqual({});
  });

  it('build() returns the correct tlsx command with -u and required flags', () => {
    const input = TlsxScanner.inputSchema.parse({});
    const result = TlsxScanner.build(input, 'example.com', ctx);
    expect(result.cmd[0]).toBe('tlsx');
    expect(result.cmd).toContain('-u');
    expect(result.cmd).toContain('example.com');
    expect(result.cmd).toContain('-json');
    expect(result.cmd).toContain('-silent');
  });
});
