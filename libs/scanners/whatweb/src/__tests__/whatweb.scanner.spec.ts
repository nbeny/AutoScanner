import { WhatwwebScanner } from '../whatweb.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'job_1', engagementId: 'eng_1', scratchDir: '/tmp/scratch' };

describe('WhatwwebScanner', () => {
  it('declares name, displayName, docker image, outputs, produces', () => {
    expect(WhatwwebScanner.name).toBe('whatweb');
    expect(WhatwwebScanner.displayName).toBe('WhatWeb');
    expect(WhatwwebScanner.docker.image).toBe('autoscanner/whatweb:1.0');
    expect(WhatwwebScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: 'stdout',
      parser: 'whatweb-json',
    });
    expect(WhatwwebScanner.produces).toContain('Technology');
  });

  it('build() returns exact cmd array for the target', () => {
    const input = WhatwwebScanner.inputSchema.parse({});
    const { cmd } = WhatwwebScanner.build(input, 'https://example.com', ctx);
    expect(cmd).toEqual([
      'whatweb',
      '--quiet',
      '--no-errors',
      '--log-json=/dev/stdout',
      'https://example.com',
    ]);
  });
});
