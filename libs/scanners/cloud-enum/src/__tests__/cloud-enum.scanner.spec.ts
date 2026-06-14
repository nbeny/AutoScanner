import { CloudEnumScanner } from '../cloud-enum.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };

describe('CloudEnumScanner', () => {
  it('declares name/image/output/produces, no credential', () => {
    expect(CloudEnumScanner.name).toBe('cloud-enum');
    expect(CloudEnumScanner.docker.image).toBe('autoscanner/cloud-enum:1.0');
    expect(CloudEnumScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: 'stdout',
      parser: 'cloud-enum-text',
    });
    expect(CloudEnumScanner.produces).toEqual(expect.arrayContaining(['OrgMetadata', 'Finding']));
    expect(CloudEnumScanner.requiresCredential).toBeUndefined();
  });

  it('build() derives a keyword from the target (apex label) and quotes it', () => {
    const { cmd } = CloudEnumScanner.build(
      CloudEnumScanner.inputSchema.parse({}),
      'example.com',
      ctx,
    );
    expect(cmd[2]).toContain("-k 'example'");
  });
});
