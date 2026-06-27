import { IkeScanScanner } from '../ike-scan.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('IkeScanScanner', () => {
  it('declares host network and NET_RAW capability (documented exception)', () => {
    expect(IkeScanScanner.docker.network).toBe('host');
    expect(IkeScanScanner.docker.capabilities).toEqual(['NET_RAW']);
    expect(IkeScanScanner.docker.readonlyRootfs).toBe(true);
  });

  it('build() main-mode emits ike-scan -M targets', () => {
    const input = IkeScanScanner.inputSchema.parse({ targets: ['1.1.1.1', '2.2.2.2'] });
    const { cmd } = IkeScanScanner.build(input, '1.1.1.1', ctx);
    expect(cmd).toEqual(['ike-scan', '-M', '1.1.1.1', '2.2.2.2']);
  });

  it('build() aggressive mode emits -A -n testid -P with custom transformSet', () => {
    const input = IkeScanScanner.inputSchema.parse({
      targets: ['1.1.1.1'],
      aggressive: true,
      transformSet: '5,2,1,2',
    });
    const { cmd } = IkeScanScanner.build(input, '1.1.1.1', ctx);
    expect(cmd).toEqual(['ike-scan', '-A', '-n', 'testid', '-P', '--trans=5,2,1,2', '1.1.1.1']);
  });

  it('falls back to target when targets empty', () => {
    const { cmd } = IkeScanScanner.build(IkeScanScanner.inputSchema.parse({}), '3.3.3.3', ctx);
    expect(cmd[cmd.length - 1]).toBe('3.3.3.3');
  });

  it('TEXT stdout → ike-scan-text, produces Service+Finding', () => {
    expect(IkeScanScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: 'stdout',
      parser: 'ike-scan-text',
    });
    expect(IkeScanScanner.produces).toEqual(['Service', 'Finding']);
  });
});
