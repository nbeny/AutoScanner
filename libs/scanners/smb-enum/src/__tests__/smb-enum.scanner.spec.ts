import { SmbEnumScanner } from '../smb-enum.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };

describe('SmbEnumScanner', () => {
  it('declares name, docker image, TEXT output → smb-text parser, produces Finding/OrgMetadata', () => {
    expect(SmbEnumScanner.name).toBe('smb-enum');
    expect(SmbEnumScanner.docker.image).toBe('autoscanner/smb-enum:1.0');
    expect(SmbEnumScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: 'stdout',
      parser: 'smb-text',
    });
    expect(SmbEnumScanner.produces).toEqual(expect.arrayContaining(['Finding', 'OrgMetadata']));
    expect(SmbEnumScanner.requiresCredential).toBeUndefined();
  });

  it('build() runs enum4linux-ng -A with shell-quoted target via sh -lc', () => {
    const { cmd } = SmbEnumScanner.build(SmbEnumScanner.inputSchema.parse({}), '10.0.0.5', ctx);
    expect(cmd[0]).toBe('sh');
    expect(cmd[1]).toBe('-lc');
    expect(cmd[2]).toContain('enum4linux-ng');
    expect(cmd[2]).toContain("'10.0.0.5'");
    expect(cmd[2]).toContain('-A');
  });

  it('build() neutralises shell metacharacters in target', () => {
    const { cmd } = SmbEnumScanner.build(
      SmbEnumScanner.inputSchema.parse({}),
      "10.0.0.5'; rm -rf /",
      ctx,
    );
    expect(cmd[2]).toContain("'10.0.0.5'\\''");
  });
});
