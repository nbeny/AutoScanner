import { CloudbruteScanner } from './cloudbrute.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'job_1', engagementId: 'eng_1', scratchDir: '/tmp' };

describe('CloudbruteScanner', () => {
  it('declares identity, CLOUD category and output parser', () => {
    expect(CloudbruteScanner.name).toBe('cloudbrute');
    expect(CloudbruteScanner.produces).toEqual(['Finding']);
    expect(CloudbruteScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: 'stdout',
      parser: 'cloudbrute-text',
    });
  });

  it('builds a keyword brute command with the bundled wordlist + config', () => {
    const { cmd } = CloudbruteScanner.build(
      { wordlist: '/etc/cloudbrute/wordlist.txt' },
      'acme',
      ctx,
    );
    expect(cmd).toEqual([
      'cloudbrute',
      '-d',
      'acme',
      '-k',
      'acme',
      '-w',
      '/etc/cloudbrute/wordlist.txt',
      '-c',
      '/etc/cloudbrute/config.yaml',
      '-t',
      '10',
      '-o',
      '/dev/stdout',
    ]);
  });
});
