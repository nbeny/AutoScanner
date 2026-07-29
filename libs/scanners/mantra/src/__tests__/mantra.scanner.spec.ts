import { MantraScanner } from '../mantra.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('MantraScanner', () => {
  it('declares name, image, TEXT file → mantra-text, produces Finding', () => {
    expect(MantraScanner.name).toBe('mantra');
    expect(MantraScanner.docker.image).toBe('autoscanner/mantra:1.0');
    expect(MantraScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: { path: '/out/result.txt' },
      parser: 'mantra-text',
    });
    expect(MantraScanner.produces).toEqual(['Finding']);
  });

  it('build() writes URLs to a file and pipes them into mantra', () => {
    const input = MantraScanner.inputSchema.parse({
      urls: ['https://a/app.js', 'https://b/main.js'],
    });
    const { cmd } = MantraScanner.build(input, 'https://a/app.js', ctx);
    expect(cmd[0]).toBe('sh');
    expect(cmd[1]).toBe('-lc');
    expect(cmd[2]).toContain(
      "printf '%s\\n' 'https://a/app.js' 'https://b/main.js' > /tmp/urls.txt",
    );
    expect(cmd[2]).toContain('cat /tmp/urls.txt | mantra');
    expect(cmd[2]).toContain('> /out/result.txt');
  });

  it('build() falls back to target when urls is empty', () => {
    const input = MantraScanner.inputSchema.parse({});
    const { cmd } = MantraScanner.build(input, 'https://only/x.js', ctx);
    expect(cmd[2]).toContain("'https://only/x.js'");
  });

  it('rejects a non-URL entry', () => {
    expect(() => MantraScanner.inputSchema.parse({ urls: ['not a url'] })).toThrow();
  });
});
