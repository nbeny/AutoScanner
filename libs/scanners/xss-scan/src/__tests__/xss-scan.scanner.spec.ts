import { XssScanScanner } from '../xss-scan.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };

describe('XssScanScanner', () => {
  it('reuses the dalfox image, JSON to dalfox-json, produces Finding', () => {
    expect(XssScanScanner.name).toBe('xss-scan');
    expect(XssScanScanner.docker.image).toBe('ghcr.io/hahwul/dalfox:v2.9.4');
    expect(XssScanScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: 'stdout',
      parser: 'dalfox-json',
    });
    expect(XssScanScanner.produces).toEqual(['Finding']);
    expect(XssScanScanner.requiresCredential).toBeUndefined();
  });

  it('build() runs dalfox url with JSON output and quotes the target (detect default)', () => {
    const { cmd } = XssScanScanner.build(
      XssScanScanner.inputSchema.parse({}),
      'https://x.test/?q=1',
      ctx,
    );
    expect(cmd[0]).toBe('sh');
    expect(cmd[1]).toBe('-lc');
    expect(cmd[2]).toContain('dalfox url');
    expect(cmd[2]).toContain("'https://x.test/?q=1'");
    expect(cmd[2]).toContain('--format json');
    expect(cmd[2]).not.toContain('-b ');
  });

  it('aggressive level enables mining/DOM but still no blind callback', () => {
    const { cmd } = XssScanScanner.build(
      XssScanScanner.inputSchema.parse({ level: 'aggressive' }),
      'https://x.test',
      ctx,
    );
    expect(cmd[2]).toContain('--mining-dom');
    expect(cmd[2]).not.toContain('-b ');
  });
});
