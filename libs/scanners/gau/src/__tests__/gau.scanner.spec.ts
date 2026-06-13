import { GauScanner } from '../gau.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };

describe('GauScanner', () => {
  it('declares name, docker, outputs, produces', () => {
    expect(GauScanner.name).toBe('gau');
    expect(GauScanner.docker.image).toBe('autoscanner/gau:1.0');
    expect(GauScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: 'stdout',
      parser: 'urllines-text',
    });
    expect(GauScanner.produces).toContain('Endpoint');
  });

  it('inputSchema default subs=true', () => {
    expect(GauScanner.inputSchema.parse({})).toEqual({ subs: true });
  });

  it('build() includes --subs when subs=true', () => {
    const { cmd } = GauScanner.build(GauScanner.inputSchema.parse({}), 'example.com', ctx);
    expect(cmd).toEqual(['gau', '--subs', 'example.com']);
  });

  it('build() omits --subs when subs=false', () => {
    const { cmd } = GauScanner.build(
      GauScanner.inputSchema.parse({ subs: false }),
      'example.com',
      ctx,
    );
    expect(cmd).toEqual(['gau', 'example.com']);
  });
});
