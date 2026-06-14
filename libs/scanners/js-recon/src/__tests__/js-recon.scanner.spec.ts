import { JsReconScanner } from '../js-recon.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };

describe('JsReconScanner', () => {
  it('declares name, docker image, JSON output → js-recon-json parser, produces Endpoint+Finding', () => {
    expect(JsReconScanner.name).toBe('js-recon');
    expect(JsReconScanner.docker.image).toBe('autoscanner/js-recon:1.0');
    expect(JsReconScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: 'stdout',
      parser: 'js-recon-json',
    });
    expect(JsReconScanner.produces).toEqual(expect.arrayContaining(['Endpoint', 'Finding']));
    expect(JsReconScanner.requiresCredential).toBeUndefined();
  });

  it('build() runs sh -lc invoking js-recon wrapper with shell-quoted target', () => {
    const { cmd } = JsReconScanner.build(JsReconScanner.inputSchema.parse({}), 'example.com', ctx);
    expect(cmd[0]).toBe('sh');
    expect(cmd[1]).toBe('-lc');
    expect(cmd[2]).toContain('js-recon');
    expect(cmd[2]).toContain("'example.com'");
  });

  it('build() neutralises shell metacharacters in target', () => {
    const { cmd } = JsReconScanner.build(
      JsReconScanner.inputSchema.parse({}),
      'a.com; rm -rf /',
      ctx,
    );
    expect(cmd[2]).toContain("'a.com; rm -rf /'");
  });
});
