import { PurednsScanner } from '../puredns.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'job_1', engagementId: 'eng_1', scratchDir: '/tmp/scratch' };

describe('PurednsScanner', () => {
  it('declares name, docker, outputs, produces', () => {
    expect(PurednsScanner.name).toBe('puredns');
    expect(PurednsScanner.displayName).toBe('puredns');
    expect(PurednsScanner.docker.image).toBe('autoscanner/puredns:1.0');
    expect(PurednsScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: 'stdout',
      parser: 'hostlines-text',
    });
    expect(PurednsScanner.produces).toContain('Subdomain');
  });

  it('inputSchema defaults to bruteforce with the bundled wordlist', () => {
    expect(PurednsScanner.inputSchema.parse({})).toEqual({
      mode: 'bruteforce',
      wordlist: '/etc/puredns/wordlist.txt',
    });
  });

  it('build() in bruteforce mode runs against the target domain with bundled lists', () => {
    const input = PurednsScanner.inputSchema.parse({});
    const built = PurednsScanner.build(input, 'example.com', ctx);
    expect(built.cmd).toEqual([
      'puredns',
      'bruteforce',
      '/etc/puredns/wordlist.txt',
      'example.com',
      '--resolvers',
      '/etc/puredns/resolvers.txt',
      '--quiet',
    ]);
    expect(built.stdin).toBeUndefined();
  });

  it('build() in resolve mode reads the target list from stdin', () => {
    const input = PurednsScanner.inputSchema.parse({ mode: 'resolve' });
    const built = PurednsScanner.build(input, 'sub.example.com', ctx);
    expect(built.cmd).toEqual([
      'puredns',
      'resolve',
      '--resolvers',
      '/etc/puredns/resolvers.txt',
      '--quiet',
    ]);
    expect(built.stdin).toBe('sub.example.com');
  });
});
