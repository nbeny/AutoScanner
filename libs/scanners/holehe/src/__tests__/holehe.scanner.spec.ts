import { HoleheScanner } from '../holehe.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('HoleheScanner', () => {
  it('declares name, image, TEXT stdout → holehe-text, produces Identity', () => {
    expect(HoleheScanner.name).toBe('holehe');
    expect(HoleheScanner.docker.image).toBe('autoscanner/holehe:1.0');
    expect(HoleheScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: 'stdout',
      parser: 'holehe-text',
    });
    expect(HoleheScanner.produces).toEqual(['Identity']);
  });

  it('build() loops emails with SEED markers and --only-used', () => {
    const input = HoleheScanner.inputSchema.parse({ emails: ['a@b.com', 'c@d.io'] });
    const { cmd } = HoleheScanner.build(input, 'a@b.com', ctx);
    expect(cmd[2]).toContain('## SEED a@b.com');
    expect(cmd[2]).toContain('## SEED c@d.io');
    expect(cmd[2]).toContain('holehe');
    expect(cmd[2]).toContain('--only-used');
  });

  it('build() falls back to target when emails is empty', () => {
    const { cmd } = HoleheScanner.build(HoleheScanner.inputSchema.parse({}), 'x@y.com', ctx);
    expect(cmd[2]).toContain('## SEED x@y.com');
  });

  it('rejects malformed emails via Zod', () => {
    expect(() => HoleheScanner.inputSchema.parse({ emails: ['not-an-email; rm -rf /'] })).toThrow();
  });
});
