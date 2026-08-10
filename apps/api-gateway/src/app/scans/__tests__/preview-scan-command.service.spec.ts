import { z } from 'zod';
import { ScannerRegistry, type ScannerDefinition } from '@autoscanner/scanner-sdk';
import { ScannerCategory } from '@autoscanner/scanner-sdk';
import { PreviewScanCommandService } from '../preview-scan-command.service';

function makeDef(name: string, overrides: Partial<ScannerDefinition> = {}): ScannerDefinition {
  return {
    name,
    displayName: name,
    category: [ScannerCategory.PORT_SCAN],
    description: `${name} test scanner`,
    inputSchema: z.object({ ports: z.string().default('1-1000'), sv: z.boolean().optional() }),
    docker: {
      image: `${name}:latest`,
      network: 'bridge',
      capabilities: [],
      readonlyRootfs: true,
      memoryLimitMb: 512,
      cpuQuota: 500_000,
      defaultTimeoutMs: 60_000,
    },
    build: (input: { ports: string; sv?: boolean }, target: string) => ({
      cmd: [name, '-p', input.ports, ...(input.sv ? ['-sV'] : []), '-oX', '-', target],
    }),
    outputs: [{ format: 'XML', capture: 'stdout', parser: `${name}-xml` }],
    produces: ['Asset'],
    ...overrides,
  } as ScannerDefinition;
}

function svcWith(...defs: ScannerDefinition[]): PreviewScanCommandService {
  const registry = new ScannerRegistry();
  defs.forEach((d) => registry.register(d));
  return new PreviewScanCommandService(registry);
}

describe('PreviewScanCommandService', () => {
  it('builds the exact image + argv from typed options', () => {
    const svc = svcWith(makeDef('nmap'));
    const res = svc.preview(
      'nmap',
      'scanme.example.com',
      JSON.stringify({ ports: '1-1000', sv: true }),
    );
    expect(res.image).toBe('nmap:latest');
    expect(res.argv).toEqual(['nmap', '-p', '1-1000', '-sV', '-oX', '-', 'scanme.example.com']);
    expect(res.note).toBeNull();
  });

  it('injects extraArgs verbatim after argv[0], like the run path', () => {
    const svc = svcWith(makeDef('nmap'));
    const res = svc.preview(
      'nmap',
      'scanme.example.com',
      JSON.stringify({ ports: '80', extraArgs: ['-Pn', '--script', 'http-title'] }),
    );
    expect(res.argv).toEqual([
      'nmap',
      '-Pn',
      '--script',
      'http-title',
      '-p',
      '80',
      '-oX',
      '-',
      'scanme.example.com',
    ]);
  });

  it('applies schema defaults when options are empty', () => {
    const svc = svcWith(makeDef('nmap'));
    const res = svc.preview('nmap', 't', '');
    expect(res.argv).toEqual(['nmap', '-p', '1-1000', '-oX', '-', 't']);
  });

  it('returns a note (not a throw) when the schema rejects the options', () => {
    const svc = svcWith(makeDef('nmap'));
    const res = svc.preview('nmap', 't', JSON.stringify({ ports: 123 })); // ports must be string
    expect(res.argv).toEqual([]);
    expect(res.note).toBeTruthy();
  });

  it('flags a required credential in the note', () => {
    const svc = svcWith(
      makeDef('shodan', {
        inputSchema: z.object({}),
        requiresCredential: 'SHODAN',
        build: () => ({ cmd: ['shodan', 'host'] }),
      }),
    );
    const res = svc.preview('shodan', '1.1.1.1', '');
    expect(res.argv).toEqual(['shodan', 'host']);
    expect(res.note).toContain('SHODAN');
  });

  it('throws for an unknown scanner', () => {
    const svc = svcWith(makeDef('nmap'));
    expect(() => svc.preview('ghost', 't', '')).toThrow(/not found/);
  });
});
