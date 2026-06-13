import { SubfinderScanner } from '../subfinder.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = {
  scanJobId: 'job_1',
  engagementId: 'eng_1',
  scratchDir: '/tmp/scratch',
};

describe('SubfinderScanner', () => {
  it('declares name, docker, outputs, produces per spec', () => {
    expect(SubfinderScanner.name).toBe('subfinder');
    expect(SubfinderScanner.displayName).toBe('Subfinder');
    expect(SubfinderScanner.docker.image).toBe('projectdiscovery/subfinder:v2.14.0');
    expect(SubfinderScanner.docker.network).toBe('bridge');
    expect(SubfinderScanner.docker.capabilities).toEqual([]);
    expect(SubfinderScanner.docker.readonlyRootfs).toBe(true);
    expect(SubfinderScanner.docker.memoryLimitMb).toBe(512);
    expect(SubfinderScanner.docker.cpuQuota).toBe(1_000_000);
    expect(SubfinderScanner.docker.defaultTimeoutMs).toBe(600_000);
    expect(SubfinderScanner.outputs[0]).toEqual({
      format: 'JSONL',
      capture: 'stdout',
      parser: 'subfinder-json',
    });
    expect(SubfinderScanner.produces).toContain('Asset');
    expect(SubfinderScanner.produces).toContain('Subdomain');
  });

  it('inputSchema applies defaults', () => {
    const parsed = SubfinderScanner.inputSchema.parse({});
    expect(parsed).toMatchObject({
      sources: [],
      recursive: false,
      timeout: 60,
    });
  });

  it('build() emits subfinder with silent, JSONL output, target domain, and timeout', () => {
    const input = SubfinderScanner.inputSchema.parse({});
    const { cmd } = SubfinderScanner.build(input, 'example.com', ctx);
    expect(cmd[0]).toBe('subfinder');
    expect(cmd).toEqual(
      expect.arrayContaining(['-silent', '-oJ', '-d', 'example.com', '-timeout', '60']),
    );
    expect(cmd).not.toContain('-recursive');
    expect(cmd).not.toContain('-sources');
  });

  it('build() includes -recursive when recursive=true', () => {
    const input = SubfinderScanner.inputSchema.parse({ recursive: true });
    const { cmd } = SubfinderScanner.build(input, 'example.com', ctx);
    expect(cmd).toContain('-recursive');
  });

  it('build() includes -sources with comma-joined list when sources are provided', () => {
    const input = SubfinderScanner.inputSchema.parse({ sources: ['shodan', 'crtsh'] });
    const { cmd } = SubfinderScanner.build(input, 'example.com', ctx);
    expect(cmd).toContain('-sources');
    expect(cmd).toContain('shodan,crtsh');
  });

  it('rejects out-of-range timeout', () => {
    expect(() => SubfinderScanner.inputSchema.parse({ timeout: 0 })).toThrow();
    expect(() => SubfinderScanner.inputSchema.parse({ timeout: 601 })).toThrow();
  });
});
