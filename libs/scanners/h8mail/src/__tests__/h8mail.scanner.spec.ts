import { H8mailScanner } from '../h8mail.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('H8mailScanner', () => {
  it('declares name, image, JSON file → h8mail-json, produces BreachExposure, breach-intel category', () => {
    expect(H8mailScanner.name).toBe('h8mail');
    expect(H8mailScanner.docker.image).toBe('autoscanner/h8mail:1.0');
    expect(H8mailScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: { path: '/out/result.json' },
      parser: 'h8mail-json',
    });
    expect(H8mailScanner.produces).toEqual(['BreachExposure']);
    expect(H8mailScanner.category).toContain('breach-intel');
  });

  it('build() writes emails to a file and runs h8mail --json', () => {
    const input = H8mailScanner.inputSchema.parse({ emails: ['a@x.com', 'b@y.com'] });
    const { cmd } = H8mailScanner.build(input, 'a@x.com', ctx);
    expect(cmd[0]).toBe('sh');
    expect(cmd[2]).toContain("printf '%s\\n' 'a@x.com' 'b@y.com' > /tmp/targets.txt");
    expect(cmd[2]).toContain('h8mail -t /tmp/targets.txt');
    expect(cmd[2]).toContain('--json /out/result.json');
  });

  it('falls back to target and rejects an empty email', () => {
    const input = H8mailScanner.inputSchema.parse({});
    const { cmd } = H8mailScanner.build(input, 'only@z.com', ctx);
    expect(cmd[2]).toContain("'only@z.com'");
    expect(() => H8mailScanner.inputSchema.parse({ emails: [''] })).toThrow();
  });
});
