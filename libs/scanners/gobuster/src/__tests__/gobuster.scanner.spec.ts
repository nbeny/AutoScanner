import { GobusterScanner } from '../gobuster.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };

describe('GobusterScanner', () => {
  it('declares name, docker, outputs, produces', () => {
    expect(GobusterScanner.name).toBe('gobuster');
    expect(GobusterScanner.docker.image).toBe('autoscanner/gobuster:1.0');
    expect(GobusterScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: 'stdout',
      parser: 'gobuster-text',
    });
    expect(GobusterScanner.produces).toContain('Endpoint');
  });

  it('inputSchema defaults', () => {
    expect(GobusterScanner.inputSchema.parse({})).toEqual({
      wordlist: '/etc/gobuster/content.txt',
    });
  });

  it('build() brute-forces https://<target> with bundled wordlist, quiet, no-color, to stdout', () => {
    const { cmd } = GobusterScanner.build(
      GobusterScanner.inputSchema.parse({}),
      'example.com',
      ctx,
    );
    expect(cmd).toEqual([
      'gobuster',
      'dir',
      '-u',
      'https://example.com',
      '-w',
      '/etc/gobuster/content.txt',
      '-q',
      '--no-color',
      '-o',
      '/dev/stdout',
    ]);
  });
});
