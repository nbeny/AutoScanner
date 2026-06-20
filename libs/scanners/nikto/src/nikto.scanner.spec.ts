import { NiktoScanner } from './nikto.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'job_1', engagementId: 'eng_1', scratchDir: '/output' };

describe('NiktoScanner', () => {
  it('uses file capture into the scratch dir', () => {
    expect(NiktoScanner.produces).toEqual(['Finding']);
    expect(NiktoScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: { path: 'nikto.json' },
      parser: 'nikto-json',
    });
  });

  it('builds an argv command writing JSON into scratchDir', () => {
    const { cmd } = NiktoScanner.build({}, 'http://example.com', ctx);
    expect(cmd).toEqual([
      'nikto',
      '-h',
      'http://example.com',
      '-Format',
      'json',
      '-output',
      '/output/nikto.json',
      '-ask',
      'no',
    ]);
  });

  it('appends -Tuning when provided', () => {
    const { cmd } = NiktoScanner.build({ tuning: '2' }, 'http://x', ctx);
    expect(cmd).toEqual(expect.arrayContaining(['-Tuning', '2']));
  });
});
