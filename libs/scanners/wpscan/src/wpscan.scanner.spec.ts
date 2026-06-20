import { WpscanScanner } from './wpscan.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'job_1', engagementId: 'eng_1', scratchDir: '/tmp' };

describe('WpscanScanner', () => {
  it('declares identity, category and output parser', () => {
    expect(WpscanScanner.name).toBe('wpscan');
    expect(WpscanScanner.produces).toEqual(['Technology', 'Finding']);
    expect(WpscanScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: 'stdout',
      parser: 'wpscan-json',
    });
    expect(WpscanScanner.requiresCredential).toBeUndefined();
  });

  it('builds an argv command with the target and default enumerate set', () => {
    const { cmd } = WpscanScanner.build({}, 'http://blog.example.com', ctx);
    expect(cmd).toEqual([
      'wpscan',
      '--url',
      'http://blog.example.com',
      '--format',
      'json',
      '--no-banner',
      '--random-user-agent',
      '--enumerate',
      'vp,vt,u',
    ]);
  });

  it('honours a custom enumerate input', () => {
    const { cmd } = WpscanScanner.build({ enumerate: 'ap,at' }, 'http://x', ctx);
    expect(cmd).toContain('ap,at');
  });
});
