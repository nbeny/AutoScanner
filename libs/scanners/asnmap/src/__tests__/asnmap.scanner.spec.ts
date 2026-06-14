import { AsnmapScanner } from '../asnmap.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };

describe('AsnmapScanner', () => {
  it('declares name, docker image, JSONL output → asnmap-json parser, produces OrgMetadata', () => {
    expect(AsnmapScanner.name).toBe('asnmap');
    expect(AsnmapScanner.docker.image).toBe('autoscanner/asnmap:1.0');
    expect(AsnmapScanner.outputs[0]).toEqual({
      format: 'JSONL',
      capture: 'stdout',
      parser: 'asnmap-json',
    });
    expect(AsnmapScanner.produces).toEqual(expect.arrayContaining(['OrgMetadata']));
    expect(AsnmapScanner.requiresCredential).toBeUndefined();
  });

  it('build() runs asnmap -d <target> with JSON+silent, shell-quoting the target', () => {
    const { cmd } = AsnmapScanner.build(AsnmapScanner.inputSchema.parse({}), 'example.com', ctx);
    expect(cmd[0]).toBe('sh');
    expect(cmd[1]).toBe('-lc');
    expect(cmd[2]).toContain('asnmap');
    expect(cmd[2]).toContain("-d 'example.com'");
    expect(cmd[2]).toContain('-json');
  });

  it('build() neutralises shell metacharacters in target', () => {
    const { cmd } = AsnmapScanner.build(
      AsnmapScanner.inputSchema.parse({}),
      'a.com; rm -rf /',
      ctx,
    );
    expect(cmd[2]).toContain("'a.com; rm -rf /'");
  });
});
