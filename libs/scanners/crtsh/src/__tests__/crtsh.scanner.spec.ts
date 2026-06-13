import { CrtshScanner } from '../crtsh.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };

describe('CrtshScanner', () => {
  it('declares name, docker, outputs, produces', () => {
    expect(CrtshScanner.name).toBe('crtsh');
    expect(CrtshScanner.docker.image).toBe('autoscanner/crtsh:1.0');
    expect(CrtshScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: 'stdout',
      parser: 'crtsh-json',
    });
    expect(CrtshScanner.produces).toEqual(expect.arrayContaining(['Asset', 'Subdomain']));
  });

  it('build() curls the crt.sh JSON endpoint for the target', () => {
    const { cmd } = CrtshScanner.build(CrtshScanner.inputSchema.parse({}), 'example.com', ctx);
    expect(cmd).toEqual([
      'curl',
      '-s',
      '-H',
      'User-Agent: autoscanner',
      'https://crt.sh/?q=%25.example.com&output=json',
    ]);
  });
});
