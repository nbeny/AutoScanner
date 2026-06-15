import { CmdiScanScanner } from '../cmdi-scan.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };

describe('CmdiScanScanner', () => {
  it('uses custom image, TEXT to commix-text, produces Finding, no cred', () => {
    expect(CmdiScanScanner.name).toBe('cmdi-scan');
    expect(CmdiScanScanner.docker.image).toBe('autoscanner/cmdi-scan:1.0');
    expect(CmdiScanScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: 'stdout',
      parser: 'commix-text',
    });
    expect(CmdiScanScanner.produces).toEqual(['Finding']);
    expect(CmdiScanScanner.requiresCredential).toBeUndefined();
  });

  it('build() runs commix with quoted url, detection only (no --os-cmd / shell)', () => {
    const { cmd } = CmdiScanScanner.build(
      CmdiScanScanner.inputSchema.parse({}),
      'https://x.test/?id=1',
      ctx,
    );
    expect(cmd[0]).toBe('sh');
    expect(cmd[2]).toContain('commix');
    expect(cmd[2]).toContain("--url='https://x.test/?id=1'");
    expect(cmd[2]).toContain('--batch');
    expect(cmd[2]).not.toContain('--os-cmd');
  });

  it('aggressive raises --level 2 but stays detection-only', () => {
    const { cmd } = CmdiScanScanner.build(
      CmdiScanScanner.inputSchema.parse({ level: 'aggressive' }),
      'https://x.test',
      ctx,
    );
    expect(cmd[2]).toContain('--level 2');
    expect(cmd[2]).not.toContain('--os-cmd');
  });
});
