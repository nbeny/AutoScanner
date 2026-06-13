import { SslscanScanner } from '../sslscan.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };

describe('SslscanScanner', () => {
  it('declares name, docker image, outputs, and produces', () => {
    expect(SslscanScanner.name).toBe('sslscan');
    expect(SslscanScanner.docker.image).toBe('autoscanner/sslscan:1.0');
    expect(SslscanScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: 'stdout',
      parser: 'sslscan-text',
    });
    expect(SslscanScanner.produces).toEqual(expect.arrayContaining(['Finding']));
  });

  it('build() runs sslscan --no-colour on the target', () => {
    const { cmd } = SslscanScanner.build(SslscanScanner.inputSchema.parse({}), 'example.com', ctx);
    expect(cmd).toEqual(['sslscan', '--no-colour', 'example.com']);
  });
});
