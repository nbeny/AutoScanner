import { LeakixScanner } from '../leakix.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('LeakixScanner', () => {
  it('declares name, image, credential, category, JSON output → leakix-json, produces BreachExposure', () => {
    expect(LeakixScanner.name).toBe('leakix');
    expect(LeakixScanner.docker.image).toBe('autoscanner/leakix:1.0');
    expect(LeakixScanner.requiresCredential).toBe('LEAKIX');
    expect(LeakixScanner.credentialEnvVar).toBe('LEAKIX_API_KEY');
    expect(LeakixScanner.category).toContain('breach-intel');
    expect(LeakixScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: { path: '/out/result.json' },
      parser: 'leakix-json',
    });
    expect(LeakixScanner.produces).toEqual(['BreachExposure']);
  });

  it('build() runs leakix-probe with the query, quoted for shell safety', () => {
    const input = LeakixScanner.inputSchema.parse({ query: 'example.com' });
    const { cmd } = LeakixScanner.build(input, 'fallback.com', ctx);
    expect(cmd[0]).toBe('sh');
    expect(cmd[2]).toBe("leakix-probe 'example.com' > /out/result.json");
  });

  it('falls back to target when query is omitted', () => {
    const input = LeakixScanner.inputSchema.parse({});
    const { cmd } = LeakixScanner.build(input, 'only.example', ctx);
    expect(cmd[2]).toBe("leakix-probe 'only.example' > /out/result.json");
  });

  it('rejects an empty query string', () => {
    expect(() => LeakixScanner.inputSchema.parse({ query: '' })).toThrow();
  });

  it('shell-escapes single quotes in the query to prevent injection', () => {
    const input = LeakixScanner.inputSchema.parse({ query: "a'; rm -rf / #" });
    const { cmd } = LeakixScanner.build(input, 'fallback.com', ctx);
    expect(cmd[2]).toBe("leakix-probe 'a'\\''; rm -rf / #' > /out/result.json");
  });
});
