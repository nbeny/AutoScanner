import { SpoofyScanner } from '../spoofy.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('SpoofyScanner', () => {
  it('declares name, image, JSON stdout → spoofy-json, produces Finding', () => {
    expect(SpoofyScanner.name).toBe('spoofy');
    expect(SpoofyScanner.docker.image).toBe('autoscanner/spoofy:1.0');
    expect(SpoofyScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: 'stdout',
      parser: 'spoofy-json',
    });
    expect(SpoofyScanner.produces).toEqual(['Finding']);
  });

  it('build() runs spoofy.py with -d <target> -o json', () => {
    const input = SpoofyScanner.inputSchema.parse({});
    const { cmd } = SpoofyScanner.build(input, 'acme.tld', ctx);
    expect(cmd).toEqual(['python', '/opt/spoofy/spoofy.py', '-d', 'acme.tld', '-o', 'json']);
  });
});
