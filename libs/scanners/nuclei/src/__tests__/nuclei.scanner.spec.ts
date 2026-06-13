import { NucleiScanner } from '../nuclei.scanner';
import { ScannerCategory, type BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = {
  scanJobId: 'job_1',
  engagementId: 'eng_1',
  scratchDir: '/tmp/scratch',
};

describe('NucleiScanner', () => {
  it('declares name, docker, outputs, produces per spec', () => {
    expect(NucleiScanner.name).toBe('nuclei');
    expect(NucleiScanner.displayName).toBe('nuclei');
    expect(NucleiScanner.category).toContain(ScannerCategory.VULN_SCAN);
    expect(NucleiScanner.docker.image).toBe('projectdiscovery/nuclei:v3.9.0');
    expect(NucleiScanner.docker.network).toBe('bridge');
    expect(NucleiScanner.docker.capabilities).toEqual([]);
    expect(NucleiScanner.docker.readonlyRootfs).toBe(true);
    expect(NucleiScanner.docker.memoryLimitMb).toBeGreaterThan(0);
    expect(NucleiScanner.docker.cpuQuota).toBeGreaterThan(0);
    expect(NucleiScanner.docker.defaultTimeoutMs).toBeGreaterThan(0);
    expect(NucleiScanner.outputs[0]).toEqual({
      format: 'JSONL',
      capture: 'stdout',
      parser: 'nuclei-json',
    });
    expect(NucleiScanner.produces).toContain('Finding');
  });

  it('inputSchema accepts empty input (all fields optional)', () => {
    const parsed = NucleiScanner.inputSchema.parse({});
    expect(parsed).toBeDefined();
  });

  it('inputSchema accepts severity, tags, and templates arrays', () => {
    const parsed = NucleiScanner.inputSchema.parse({
      severity: ['critical', 'high'],
      tags: ['cve', 'rce'],
      templates: ['http/cves/2021/CVE-2021-44228.yaml'],
    });
    expect(parsed.severity).toEqual(['critical', 'high']);
    expect(parsed.tags).toEqual(['cve', 'rce']);
    expect(parsed.templates).toEqual(['http/cves/2021/CVE-2021-44228.yaml']);
  });

  it('inputSchema rejects invalid severity values', () => {
    expect(() => NucleiScanner.inputSchema.parse({ severity: ['extreme'] })).toThrow();
  });

  it('build() returns nuclei command with -silent -jsonl and -disable-update-check', () => {
    const input = NucleiScanner.inputSchema.parse({});
    const result = NucleiScanner.build(input, 'https://example.com', ctx);
    expect(result.cmd[0]).toBe('nuclei');
    expect(result.cmd).toContain('-silent');
    expect(result.cmd).toContain('-jsonl');
    expect(result.cmd).toContain('-disable-update-check');
  });

  it('build() passes target via stdin, not as a CLI arg', () => {
    const input = NucleiScanner.inputSchema.parse({});
    const result = NucleiScanner.build(input, 'https://example.com', ctx);
    expect(result.stdin).toBe('https://example.com');
    expect(result.cmd).not.toContain('https://example.com');
  });

  it('build() includes -severity flag when severity provided (comma-joined)', () => {
    const input = NucleiScanner.inputSchema.parse({ severity: ['critical', 'high'] });
    const result = NucleiScanner.build(input, 'https://example.com', ctx);
    const idx = result.cmd.indexOf('-severity');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(result.cmd[idx + 1]).toBe('critical,high');
  });

  it('build() omits -severity flag when severity not provided', () => {
    const input = NucleiScanner.inputSchema.parse({});
    const result = NucleiScanner.build(input, 'https://example.com', ctx);
    expect(result.cmd).not.toContain('-severity');
  });

  it('build() includes -tags flag when tags provided (comma-joined)', () => {
    const input = NucleiScanner.inputSchema.parse({ tags: ['cve', 'rce'] });
    const result = NucleiScanner.build(input, 'https://example.com', ctx);
    const idx = result.cmd.indexOf('-tags');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(result.cmd[idx + 1]).toBe('cve,rce');
  });

  it('build() omits -tags flag when tags not provided or empty', () => {
    const input = NucleiScanner.inputSchema.parse({});
    const result = NucleiScanner.build(input, 'https://example.com', ctx);
    expect(result.cmd).not.toContain('-tags');
  });

  it('build() includes -templates flag for each template provided', () => {
    const input = NucleiScanner.inputSchema.parse({
      templates: [
        'http/cves/2021/CVE-2021-44228.yaml',
        'http/misconfiguration/exposed-panels.yaml',
      ],
    });
    const result = NucleiScanner.build(input, 'https://example.com', ctx);
    // -t is the short flag nuclei accepts; we use -templates but either OK.
    const flagCount = result.cmd.filter((arg) => arg === '-t' || arg === '-templates').length;
    expect(flagCount).toBe(2);
    expect(result.cmd).toContain('http/cves/2021/CVE-2021-44228.yaml');
    expect(result.cmd).toContain('http/misconfiguration/exposed-panels.yaml');
  });

  it('build() omits -templates flag when templates not provided', () => {
    const input = NucleiScanner.inputSchema.parse({});
    const result = NucleiScanner.build(input, 'https://example.com', ctx);
    expect(result.cmd).not.toContain('-templates');
    expect(result.cmd).not.toContain('-t');
  });
});
