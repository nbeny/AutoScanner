import { IntelxScanner } from '../intelx.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('IntelxScanner', () => {
  it('declares name, image, credential, category, JSON output → intelx-json, produces BreachExposure', () => {
    expect(IntelxScanner.name).toBe('intelx');
    expect(IntelxScanner.docker.image).toBe('autoscanner/intelx:1.0');
    expect(IntelxScanner.requiresCredential).toBe('INTELX');
    expect(IntelxScanner.credentialEnvVar).toBe('INTELX_API_KEY');
    expect(IntelxScanner.category).toContain('breach-intel');
    expect(IntelxScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: { path: '/out/result.json' },
      parser: 'intelx-json',
    });
    expect(IntelxScanner.produces).toEqual(['BreachExposure']);
  });

  it('build() runs intelx-probe with the query, quoted for shell safety', () => {
    const input = IntelxScanner.inputSchema.parse({ query: 'example.com' });
    const { cmd } = IntelxScanner.build(input, 'fallback.com', ctx);
    expect(cmd[0]).toBe('sh');
    expect(cmd[2]).toBe("intelx-probe 'example.com' > /out/result.json");
  });

  it('falls back to target when query is omitted', () => {
    const input = IntelxScanner.inputSchema.parse({});
    const { cmd } = IntelxScanner.build(input, 'only.example', ctx);
    expect(cmd[2]).toBe("intelx-probe 'only.example' > /out/result.json");
  });

  it('rejects an empty query string', () => {
    expect(() => IntelxScanner.inputSchema.parse({ query: '' })).toThrow();
  });

  it('shell-escapes single quotes in the query to prevent injection', () => {
    const input = IntelxScanner.inputSchema.parse({ query: "a'; rm -rf / #" });
    const { cmd } = IntelxScanner.build(input, 'fallback.com', ctx);
    expect(cmd[2]).toBe("intelx-probe 'a'\\''; rm -rf / #' > /out/result.json");
  });
});
