import { ArjunScanner } from './arjun.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'job_1', engagementId: 'eng_1', scratchDir: '/output' };

describe('ArjunScanner', () => {
  it('produces a Finding via file capture', () => {
    expect(ArjunScanner.produces).toEqual(['Finding']);
    expect(ArjunScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: { path: 'arjun.json' },
      parser: 'arjun-json',
    });
  });

  it('builds a command targeting a single URL writing JSON into scratchDir', () => {
    const { cmd } = ArjunScanner.build({}, 'http://example.com/search.php', ctx);
    expect(cmd).toEqual([
      'arjun',
      '-u',
      'http://example.com/search.php',
      '-oJ',
      '/output/arjun.json',
    ]);
  });

  it('appends -m when a method is given', () => {
    const { cmd } = ArjunScanner.build({ method: 'POST' }, 'http://x', ctx);
    expect(cmd).toEqual(expect.arrayContaining(['-m', 'POST']));
  });
});
