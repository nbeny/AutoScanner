import { MaigretScanner } from '../maigret.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('MaigretScanner', () => {
  it('declares name, image, TEXT stdout output → maigret-text, produces Identity', () => {
    expect(MaigretScanner.name).toBe('maigret');
    expect(MaigretScanner.docker.image).toBe('autoscanner/maigret:1.0');
    expect(MaigretScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: 'stdout',
      parser: 'maigret-text',
    });
    expect(MaigretScanner.produces).toEqual(['Identity']);
    expect(MaigretScanner.requiresCredential).toBeUndefined();
  });

  it('build() loops usernames, emitting a SEED marker before each maigret run', () => {
    const input = MaigretScanner.inputSchema.parse({ usernames: ['jdoe', 'alice'] });
    const { cmd } = MaigretScanner.build(input, 'jdoe', ctx);
    expect(cmd[0]).toBe('sh');
    expect(cmd[1]).toBe('-lc');
    expect(cmd[2]).toContain('## SEED jdoe');
    expect(cmd[2]).toContain('## SEED alice');
    expect(cmd[2]).toContain('maigret');
    expect(cmd[2]).toContain('--print-found');
    expect(cmd[2]).toContain('--top-sites 500');
  });

  it('build() falls back to target when usernames is empty', () => {
    const input = MaigretScanner.inputSchema.parse({});
    const { cmd } = MaigretScanner.build(input, 'bob', ctx);
    expect(cmd[2]).toContain('## SEED bob');
  });

  it('build() rejects shell metacharacters in usernames via Zod', () => {
    expect(() => MaigretScanner.inputSchema.parse({ usernames: ['a; rm -rf /'] })).toThrow();
  });
});
