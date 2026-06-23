import { AlterxScanner } from '../alterx.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('AlterxScanner', () => {
  it('declares name, image, TEXT stdout → hostlines-text, produces Subdomain/Asset', () => {
    expect(AlterxScanner.name).toBe('alterx');
    expect(AlterxScanner.docker.image).toBe('autoscanner/alterx:1.0');
    expect(AlterxScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: 'stdout',
      parser: 'hostlines-text',
    });
    expect(AlterxScanner.produces).toEqual(expect.arrayContaining(['Subdomain', 'Asset']));
  });

  it('build() pipes alterx permutations into dnsx, honouring the limit', () => {
    const { cmd } = AlterxScanner.build(
      AlterxScanner.inputSchema.parse({ maxPermutations: 5000 }),
      'example.com',
      ctx,
    );
    expect(cmd[0]).toBe('sh');
    expect(cmd[2]).toContain("alterx -d 'example.com'");
    expect(cmd[2]).toContain('-enrich');
    expect(cmd[2]).toContain('-limit 5000');
    expect(cmd[2]).toContain('| dnsx -silent');
  });

  it('build() defaults the permutation limit to 10000', () => {
    const { cmd } = AlterxScanner.build(AlterxScanner.inputSchema.parse({}), 'example.com', ctx);
    expect(cmd[2]).toContain('-limit 10000');
  });

  it('build() neutralises shell metacharacters in target', () => {
    const { cmd } = AlterxScanner.build(AlterxScanner.inputSchema.parse({}), 'a.com; id', ctx);
    expect(cmd[2]).toContain("'a.com; id'");
  });
});
