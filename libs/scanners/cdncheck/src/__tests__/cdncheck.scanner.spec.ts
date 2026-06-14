import { CdncheckScanner } from '../cdncheck.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };

describe('CdncheckScanner', () => {
  it('declares name, docker image, JSONL output → cdncheck-json parser, produces Technology', () => {
    expect(CdncheckScanner.name).toBe('cdncheck');
    expect(CdncheckScanner.docker.image).toBe('autoscanner/cdncheck:1.0');
    expect(CdncheckScanner.outputs[0]).toEqual({
      format: 'JSONL',
      capture: 'stdout',
      parser: 'cdncheck-json',
    });
    expect(CdncheckScanner.produces).toEqual(expect.arrayContaining(['Technology']));
    expect(CdncheckScanner.requiresCredential).toBeUndefined();
  });

  it('build() runs sh -lc with echo target | cdncheck -json -silent', () => {
    const { cmd } = CdncheckScanner.build(
      CdncheckScanner.inputSchema.parse({}),
      'example.com',
      ctx,
    );
    expect(cmd[0]).toBe('sh');
    expect(cmd[1]).toBe('-lc');
    expect(cmd[2]).toContain('cdncheck');
    expect(cmd[2]).toContain("'example.com'");
    expect(cmd[2]).toContain('-json');
  });

  it('build() neutralises shell metacharacters in target', () => {
    const { cmd } = CdncheckScanner.build(
      CdncheckScanner.inputSchema.parse({}),
      'a.com; rm -rf /',
      ctx,
    );
    expect(cmd[2]).toContain("'a.com; rm -rf /'");
  });
});
