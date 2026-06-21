import { GreynoiseScanner } from './greynoise.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j1', engagementId: 'e1', scratchDir: '/tmp' };

describe('GreynoiseScanner', () => {
  it('declares identity, JSON/stdout → greynoise-json parser, no credential required', () => {
    expect(GreynoiseScanner.name).toBe('greynoise');
    expect(GreynoiseScanner.docker.image).toBe('autoscanner/greynoise:1.0');
    expect(GreynoiseScanner.outputs[0]).toEqual({ format: 'JSON', capture: 'stdout', parser: 'greynoise-json' });
    expect(GreynoiseScanner.produces).toContain('Finding');
    expect(GreynoiseScanner.requiresCredential).toBeUndefined();
  });

  it('build() calls check.py with the target IP', () => {
    const { cmd } = GreynoiseScanner.build(GreynoiseScanner.inputSchema.parse({}), '1.2.3.4', ctx);
    expect(cmd).toEqual(['python3', '/usr/local/bin/check.py', '1.2.3.4']);
  });
});
