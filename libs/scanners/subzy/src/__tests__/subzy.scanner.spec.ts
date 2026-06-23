import { SubzyScanner } from '../subzy.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('SubzyScanner', () => {
  it('declares name, image, JSON file output → subzy-json, produces Finding', () => {
    expect(SubzyScanner.name).toBe('subzy');
    expect(SubzyScanner.docker.image).toBe('autoscanner/subzy:1.0');
    expect(SubzyScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: { path: 'subzy.json' },
      parser: 'subzy-json',
    });
    expect(SubzyScanner.produces).toEqual(['Finding']);
    expect(SubzyScanner.requiresCredential).toBeUndefined();
  });

  it('build() runs subzy against the target, writing JSON to scratchDir', () => {
    const { cmd } = SubzyScanner.build(SubzyScanner.inputSchema.parse({}), 'sub.example.com', ctx);
    expect(cmd[0]).toBe('sh');
    expect(cmd[1]).toBe('-lc');
    expect(cmd[2]).toContain('subzy run --target');
    expect(cmd[2]).toContain("'sub.example.com'");
    expect(cmd[2]).toContain('/scratch/subzy.json');
    expect(cmd[2]).toContain('--hide_fails');
    expect(cmd[2]).not.toContain('--https');
  });

  it('build() adds --https when httpsOnly is set', () => {
    const { cmd } = SubzyScanner.build(
      SubzyScanner.inputSchema.parse({ httpsOnly: true }),
      'sub.example.com',
      ctx,
    );
    expect(cmd[2]).toContain('--https');
  });

  it('build() neutralises shell metacharacters in target', () => {
    const { cmd } = SubzyScanner.build(SubzyScanner.inputSchema.parse({}), 'a.com; rm -rf /', ctx);
    expect(cmd[2]).toContain("'a.com; rm -rf /'");
  });
});
