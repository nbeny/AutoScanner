import { NbtscanScanner } from './nbtscan.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j1', engagementId: 'e1', scratchDir: '/tmp' };

describe('NbtscanScanner', () => {
  it('declares identity, TEXT/stdout → nbtscan-text parser, produces Asset and Finding', () => {
    expect(NbtscanScanner.name).toBe('nbtscan');
    expect(NbtscanScanner.docker.image).toBe('autoscanner/nbtscan:1.0');
    expect(NbtscanScanner.outputs[0]).toEqual({ format: 'TEXT', capture: 'stdout', parser: 'nbtscan-text' });
    expect(NbtscanScanner.produces).toContain('Asset');
    expect(NbtscanScanner.produces).toContain('Finding');
  });

  it('build() runs nbtscan with verbose flag', () => {
    const { cmd } = NbtscanScanner.build(NbtscanScanner.inputSchema.parse({}), '10.0.0.5', ctx);
    expect(cmd[0]).toBe('sh');
    expect(cmd[2]).toContain('nbtscan');
    expect(cmd[2]).toContain('10.0.0.5');
  });
});
