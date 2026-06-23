import { MetabigorScanner } from '../metabigor.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('MetabigorScanner', () => {
  it('declares name, image, JSONL stdout → metabigor-json, produces IpAddress/OrgMetadata', () => {
    expect(MetabigorScanner.name).toBe('metabigor');
    expect(MetabigorScanner.docker.image).toBe('autoscanner/metabigor:1.0');
    expect(MetabigorScanner.outputs[0]).toEqual({
      format: 'JSONL',
      capture: 'stdout',
      parser: 'metabigor-json',
    });
    expect(MetabigorScanner.produces).toEqual(expect.arrayContaining(['IpAddress', 'OrgMetadata']));
    expect(MetabigorScanner.requiresCredential).toBeUndefined();
  });

  it('build() pipes the org into metabigor net --org --json', () => {
    const { cmd } = MetabigorScanner.build(
      MetabigorScanner.inputSchema.parse({}),
      'Example Inc',
      ctx,
    );
    expect(cmd[0]).toBe('sh');
    expect(cmd[2]).toContain("echo 'Example Inc'");
    expect(cmd[2]).toContain('metabigor net --org --json');
  });

  it('build() neutralises shell metacharacters in target', () => {
    const { cmd } = MetabigorScanner.build(MetabigorScanner.inputSchema.parse({}), 'a; id', ctx);
    expect(cmd[2]).toContain("'a; id'");
  });
});
