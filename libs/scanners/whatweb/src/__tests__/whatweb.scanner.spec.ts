import { WhatwebScanner } from '../whatweb.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'job_1', engagementId: 'eng_1', scratchDir: '/tmp/scratch' };

describe('WhatwebScanner', () => {
  it('declares name, displayName, docker image, outputs, produces', () => {
    expect(WhatwebScanner.name).toBe('whatweb');
    expect(WhatwebScanner.displayName).toBe('WhatWeb');
    expect(WhatwebScanner.docker.image).toBe('autoscanner/whatweb:1.0');
    expect(WhatwebScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: 'stdout',
      parser: 'whatweb-json',
    });
    expect(WhatwebScanner.produces).toContain('Technology');
  });

  it('build() returns exact cmd array for the target', () => {
    const input = WhatwebScanner.inputSchema.parse({});
    const { cmd } = WhatwebScanner.build(input, 'https://example.com', ctx);
    expect(cmd).toEqual([
      'whatweb',
      '--quiet',
      '--no-errors',
      '--log-json=/dev/stdout',
      'https://example.com',
    ]);
  });
});
