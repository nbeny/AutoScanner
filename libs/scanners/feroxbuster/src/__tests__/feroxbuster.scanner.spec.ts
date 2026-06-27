import { FeroxbusterScanner } from '../feroxbuster.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('FeroxbusterScanner', () => {
  it('declares name, image, JSONL stdout → feroxbuster-json, produces Endpoint', () => {
    expect(FeroxbusterScanner.name).toBe('feroxbuster');
    expect(FeroxbusterScanner.docker.image).toBe('autoscanner/feroxbuster:1.0');
    expect(FeroxbusterScanner.docker.readonlyRootfs).toBe(true);
    expect(FeroxbusterScanner.docker.network).toBe('bridge');
    expect(FeroxbusterScanner.docker.capabilities).toEqual([]);
    expect(FeroxbusterScanner.outputs[0]).toEqual({
      format: 'JSONL',
      capture: 'stdout',
      parser: 'feroxbuster-json',
    });
    expect(FeroxbusterScanner.produces).toEqual(['Endpoint']);
  });

  it('build() applies bundled wordlist and depth defaults', () => {
    const input = FeroxbusterScanner.inputSchema.parse({});
    const { cmd } = FeroxbusterScanner.build(input, 'https://acme.tld', ctx);
    expect(cmd[0]).toBe('feroxbuster');
    expect(cmd).toContain('-u');
    expect(cmd).toContain('https://acme.tld');
    expect(cmd).toContain('-w');
    expect(cmd).toContain('/etc/feroxbuster/wordlist.txt');
    expect(cmd).toContain('-d');
    expect(cmd).toContain('2');
    expect(cmd).toContain('--json');
    expect(cmd).toContain('--silent');
    expect(cmd).toContain('--no-state');
  });

  it('build() appends -x extensions when provided', () => {
    const input = FeroxbusterScanner.inputSchema.parse({ extensions: ['php', 'asp'] });
    const { cmd } = FeroxbusterScanner.build(input, 'https://acme.tld', ctx);
    expect(cmd).toContain('-x');
    expect(cmd).toContain('php,asp');
  });

  it('build() appends -C filterStatus when provided', () => {
    const input = FeroxbusterScanner.inputSchema.parse({ filterStatus: [404, 500] });
    const { cmd } = FeroxbusterScanner.build(input, 'https://acme.tld', ctx);
    expect(cmd).toContain('-C');
    expect(cmd).toContain('404,500');
  });

  it('build() honours custom depth and wordlist', () => {
    const input = FeroxbusterScanner.inputSchema.parse({ depth: 4, wordlist: '/etc/x.txt' });
    const { cmd } = FeroxbusterScanner.build(input, 'https://acme.tld', ctx);
    expect(cmd).toContain('-d');
    expect(cmd).toContain('4');
    expect(cmd).toContain('/etc/x.txt');
  });

  it('rejects negative depth via zod', () => {
    expect(() => FeroxbusterScanner.inputSchema.parse({ depth: 0 })).toThrow();
  });
});
