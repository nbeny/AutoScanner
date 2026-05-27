import { NaabuScanner } from '../naabu.scanner';
import { ScannerCategory, type BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = {
  scanJobId: 'job_1',
  engagementId: 'eng_1',
  scratchDir: '/tmp/scratch',
};

describe('NaabuScanner', () => {
  it('declares name, docker, outputs, produces per spec', () => {
    expect(NaabuScanner.name).toBe('naabu');
    expect(NaabuScanner.displayName).toBe('naabu');
    expect(NaabuScanner.category).toContain(ScannerCategory.PORT_SCAN);
    expect(NaabuScanner.docker.image).toBe('projectdiscovery/naabu:latest');
    expect(NaabuScanner.docker.network).toBe('bridge');
    expect(NaabuScanner.docker.capabilities).toEqual([]);
    expect(NaabuScanner.docker.readonlyRootfs).toBe(true);
    expect(NaabuScanner.docker.memoryLimitMb).toBe(512);
    expect(NaabuScanner.docker.cpuQuota).toBe(1_000_000);
    expect(NaabuScanner.docker.defaultTimeoutMs).toBe(600_000);
    expect(NaabuScanner.outputs[0]).toEqual({
      format: 'JSONL',
      capture: 'stdout',
      parser: 'naabu-json',
    });
    expect(NaabuScanner.produces).toContain('Asset');
    expect(NaabuScanner.produces).toContain('IpAddress');
    expect(NaabuScanner.produces).toContain('Port');
  });

  it('inputSchema applies defaults (top-100 ports, rate 1000)', () => {
    const parsed = NaabuScanner.inputSchema.parse({});
    expect(parsed).toMatchObject({
      ports: 'top-100',
      rate: 1000,
    });
  });

  it('inputSchema accepts custom port specs and rate', () => {
    const parsed = NaabuScanner.inputSchema.parse({ ports: '1-1000', rate: 2500 });
    expect(parsed.ports).toBe('1-1000');
    expect(parsed.rate).toBe(2500);
  });

  it('inputSchema rejects rates out of range', () => {
    expect(() => NaabuScanner.inputSchema.parse({ rate: 0 })).toThrow();
    expect(() => NaabuScanner.inputSchema.parse({ rate: 20_000 })).toThrow();
  });

  it('inputSchema rejects non-integer rate', () => {
    expect(() => NaabuScanner.inputSchema.parse({ rate: 1.5 })).toThrow();
  });

  it('build() returns naabu command with -silent -json -p and -rate flags', () => {
    const input = NaabuScanner.inputSchema.parse({});
    const result = NaabuScanner.build(input, '1.1.1.1', ctx);
    expect(result.cmd[0]).toBe('naabu');
    expect(result.cmd).toContain('-silent');
    expect(result.cmd).toContain('-json');
    const pIdx = result.cmd.indexOf('-p');
    expect(pIdx).toBeGreaterThanOrEqual(0);
    expect(result.cmd[pIdx + 1]).toBe('top-100');
    const rateIdx = result.cmd.indexOf('-rate');
    expect(rateIdx).toBeGreaterThanOrEqual(0);
    expect(result.cmd[rateIdx + 1]).toBe('1000');
  });

  it('build() honors custom ports + rate from input', () => {
    const input = NaabuScanner.inputSchema.parse({ ports: '1-1000', rate: 2500 });
    const result = NaabuScanner.build(input, '1.1.1.1', ctx);
    const pIdx = result.cmd.indexOf('-p');
    expect(result.cmd[pIdx + 1]).toBe('1-1000');
    const rateIdx = result.cmd.indexOf('-rate');
    expect(result.cmd[rateIdx + 1]).toBe('2500');
  });

  it('build() passes target via stdin, not as a CLI arg', () => {
    const input = NaabuScanner.inputSchema.parse({});
    const result = NaabuScanner.build(input, '1.1.1.1', ctx);
    expect(result.stdin).toBe('1.1.1.1');
    expect(result.cmd).not.toContain('1.1.1.1');
  });
});
