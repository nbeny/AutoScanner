import { RdpSecCheckScanner } from './rdp-sec-check.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j1', engagementId: 'e1', scratchDir: '/tmp' };

describe('RdpSecCheckScanner', () => {
  it('declares identity, TEXT/stdout → rdp-sec-check-text parser, produces Finding', () => {
    expect(RdpSecCheckScanner.name).toBe('rdp-sec-check');
    expect(RdpSecCheckScanner.docker.image).toBe('autoscanner/rdp-sec-check:1.0');
    expect(RdpSecCheckScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: 'stdout',
      parser: 'rdp-sec-check-text',
    });
    expect(RdpSecCheckScanner.produces).toContain('Finding');
  });

  it('build() runs rdp-sec-check.pl against target:3389 by default', () => {
    const { cmd } = RdpSecCheckScanner.build(RdpSecCheckScanner.inputSchema.parse({}), '10.0.0.5', ctx);
    expect(cmd[0]).toBe('sh');
    expect(cmd[2]).toContain('rdp-sec-check.pl');
    expect(cmd[2]).toContain('10.0.0.5');
    expect(cmd[2]).toContain('3389');
  });
});
