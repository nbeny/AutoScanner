import { HttpxScanner } from '../httpx.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = {
  scanJobId: 'job_1',
  engagementId: 'eng_1',
  scratchDir: '/tmp/scratch',
};

describe('HttpxScanner', () => {
  it('declares name, docker, outputs, produces per spec', () => {
    expect(HttpxScanner.name).toBe('httpx');
    expect(HttpxScanner.displayName).toBe('httpx');
    expect(HttpxScanner.docker.image).toBe('projectdiscovery/httpx:latest');
    expect(HttpxScanner.docker.network).toBe('bridge');
    expect(HttpxScanner.docker.capabilities).toEqual([]);
    expect(HttpxScanner.docker.readonlyRootfs).toBe(true);
    expect(HttpxScanner.docker.memoryLimitMb).toBe(512);
    expect(HttpxScanner.docker.cpuQuota).toBe(1_000_000);
    expect(HttpxScanner.docker.defaultTimeoutMs).toBe(600_000);
    expect(HttpxScanner.outputs[0]).toEqual({
      format: 'JSONL',
      capture: 'stdout',
      parser: 'httpx-json',
    });
    expect(HttpxScanner.produces).toContain('Asset');
    expect(HttpxScanner.produces).toContain('Subdomain');
    expect(HttpxScanner.produces).toContain('Technology');
  });

  it('inputSchema applies defaults', () => {
    const parsed = HttpxScanner.inputSchema.parse({});
    expect(parsed).toMatchObject({
      ports: [80, 443],
      followRedirects: true,
      techDetect: true,
      statusCode: true,
      title: true,
      timeout: 10,
    });
  });

  it('build() emits httpx with default flags, port list, timeout, and stdin === target', () => {
    const input = HttpxScanner.inputSchema.parse({});
    const result = HttpxScanner.build(input, 'example.com', ctx);
    const { cmd, stdin } = result;
    expect(cmd[0]).toBe('httpx');
    expect(cmd).toEqual(
      expect.arrayContaining([
        '-silent',
        '-json',
        '-nc',
        '-no-fallback',
        '-tech-detect',
        '-sc',
        '-title',
        '-fr',
        '-p',
        '80,443',
        '-timeout',
        '10',
      ]),
    );
    expect(stdin).toBe('example.com');
  });

  it('build() omits -tech-detect when techDetect=false', () => {
    const input = HttpxScanner.inputSchema.parse({ techDetect: false });
    const { cmd } = HttpxScanner.build(input, 'example.com', ctx);
    expect(cmd).not.toContain('-tech-detect');
  });

  it('build() omits -sc when statusCode=false', () => {
    const input = HttpxScanner.inputSchema.parse({ statusCode: false });
    const { cmd } = HttpxScanner.build(input, 'example.com', ctx);
    expect(cmd).not.toContain('-sc');
  });

  it('build() omits -title when title=false', () => {
    const input = HttpxScanner.inputSchema.parse({ title: false });
    const { cmd } = HttpxScanner.build(input, 'example.com', ctx);
    expect(cmd).not.toContain('-title');
  });

  it('build() omits -fr when followRedirects=false', () => {
    const input = HttpxScanner.inputSchema.parse({ followRedirects: false });
    const { cmd } = HttpxScanner.build(input, 'example.com', ctx);
    expect(cmd).not.toContain('-fr');
  });

  it('build() preserves multiline target as stdin', () => {
    const input = HttpxScanner.inputSchema.parse({});
    const target = 'a.example.com\nb.example.com';
    const { stdin } = HttpxScanner.build(input, target, ctx);
    expect(stdin).toBe(target);
  });

  it('build() joins custom ports with commas', () => {
    const input = HttpxScanner.inputSchema.parse({ ports: [80, 443, 8080] });
    const { cmd } = HttpxScanner.build(input, 'example.com', ctx);
    expect(cmd).toContain('-p');
    expect(cmd).toContain('80,443,8080');
  });

  it('rejects out-of-range timeout', () => {
    expect(() => HttpxScanner.inputSchema.parse({ timeout: 0 })).toThrow();
    expect(() => HttpxScanner.inputSchema.parse({ timeout: 61 })).toThrow();
  });

  it('rejects non-integer ports', () => {
    expect(() => HttpxScanner.inputSchema.parse({ ports: [80.5] })).toThrow();
  });
});
