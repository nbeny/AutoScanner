import { FaviconScanner } from '../favicon.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };

describe('FaviconScanner', () => {
  it('reuses the httpx image, passes target via stdin, JSONL → favicon-json, produces Technology', () => {
    expect(FaviconScanner.name).toBe('favicon');
    expect(FaviconScanner.docker.image).toBe('projectdiscovery/httpx:v1.9.0');
    expect(FaviconScanner.outputs[0]).toEqual({
      format: 'JSONL',
      capture: 'stdout',
      parser: 'favicon-json',
    });
    expect(FaviconScanner.produces).toEqual(expect.arrayContaining(['Technology']));
    expect(FaviconScanner.requiresCredential).toBeUndefined();
  });

  it('build() runs httpx -favicon with target on stdin (no shell interpolation)', () => {
    const { cmd, stdin } = FaviconScanner.build(
      FaviconScanner.inputSchema.parse({}),
      'example.com',
      ctx,
    );
    expect(cmd).toEqual(['httpx', '-favicon', '-json', '-silent', '-nc']);
    expect(stdin).toBe('example.com');
  });
});
