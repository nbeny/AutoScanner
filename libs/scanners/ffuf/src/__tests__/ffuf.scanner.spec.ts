import { FfufScanner } from '../ffuf.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };

describe('FfufScanner', () => {
  it('declares name, docker, outputs, produces', () => {
    expect(FfufScanner.name).toBe('ffuf');
    expect(FfufScanner.docker.image).toBe('autoscanner/ffuf:1.0');
    expect(FfufScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: 'stdout',
      parser: 'ffuf-json',
    });
    expect(FfufScanner.produces).toContain('Endpoint');
  });

  it('inputSchema defaults', () => {
    expect(FfufScanner.inputSchema.parse({})).toEqual({
      wordlist: '/etc/ffuf/content.txt',
      matchCodes: '200,204,301,302,307,401,403',
    });
  });

  it('build() fuzzes https://<target>/FUZZ with bundled wordlist + json to stdout', () => {
    const { cmd } = FfufScanner.build(FfufScanner.inputSchema.parse({}), 'example.com', ctx);
    expect(cmd).toEqual([
      'ffuf',
      '-u',
      'https://example.com/FUZZ',
      '-w',
      '/etc/ffuf/content.txt',
      '-mc',
      '200,204,301,302,307,401,403',
      '-of',
      'json',
      '-o',
      '/dev/stdout',
      '-s',
    ]);
  });
});
