import { KerbruteScanner } from './kerbrute.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'job_1', engagementId: 'eng_1', scratchDir: '/tmp' };

describe('KerbruteScanner', () => {
  it('declares identity, AD category and output parser', () => {
    expect(KerbruteScanner.name).toBe('kerbrute');
    expect(KerbruteScanner.produces).toEqual(['Finding']);
    expect(KerbruteScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: 'stdout',
      parser: 'kerbrute-text',
    });
    expect(KerbruteScanner.requiresCredential).toBeUndefined();
  });

  it('builds a userenum command targeting the domain with the bundled userlist', () => {
    const { cmd } = KerbruteScanner.build(
      { userlist: '/etc/kerbrute/userlist.txt' },
      'corp.local',
      ctx,
    );
    expect(cmd).toEqual([
      'kerbrute',
      'userenum',
      '-d',
      'corp.local',
      '-o',
      '/dev/stdout',
      '/etc/kerbrute/userlist.txt',
    ]);
  });

  it('adds --dc when an explicit DC is provided', () => {
    const { cmd } = KerbruteScanner.build(
      { dc: '10.0.0.1', userlist: '/etc/kerbrute/userlist.txt' },
      'corp.local',
      ctx,
    );
    expect(cmd).toEqual(expect.arrayContaining(['--dc', '10.0.0.1']));
    expect(cmd[cmd.length - 1]).toBe('/etc/kerbrute/userlist.txt');
  });
});
