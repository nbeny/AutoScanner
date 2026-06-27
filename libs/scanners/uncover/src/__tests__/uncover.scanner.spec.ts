import { UncoverScanner } from '../uncover.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };

describe('UncoverScanner', () => {
  it('declares name, image, JSONL → uncover-jsonl, produces Asset', () => {
    expect(UncoverScanner.name).toBe('uncover');
    expect(UncoverScanner.docker.image).toBe('autoscanner/uncover:1.0');
    expect(UncoverScanner.docker.readonlyRootfs).toBe(true);
    expect(UncoverScanner.docker.defaultTimeoutMs).toBe(600_000);
    expect(UncoverScanner.outputs[0]).toEqual({
      format: 'JSONL',
      capture: 'stdout',
      parser: 'uncover-jsonl',
    });
  });

  it('build() defaults engines to shodan,censys and limit to 200', () => {
    const input = UncoverScanner.inputSchema.parse({ query: 'port:22 country:FR' });
    const { cmd } = UncoverScanner.build(input, 'example.com', ctx);
    expect(cmd[2]).toContain("uncover -q 'port:22 country:FR'");
    expect(cmd[2]).toContain('-l 200');
    expect(cmd[2]).toContain('shodan');
    expect(cmd[2]).toContain('censys');
    expect(cmd[2]).toContain('-j');
  });

  it('build() honours explicit engines + limit and shell-escapes query', () => {
    const input = UncoverScanner.inputSchema.parse({
      query: "ssl:'acme'",
      engines: ['fofa', 'shodan'],
      limit: 50,
    });
    const { cmd } = UncoverScanner.build(input, 'example.com', ctx);
    expect(cmd[2]).toContain("'ssl:'\\''acme'\\'''");
    expect(cmd[2]).toContain('-l 50');
    expect(cmd[2]).toMatch(/-e ['"]?fofa,shodan/);
  });

  it('rejects unsupported engine values', () => {
    expect(() => UncoverScanner.inputSchema.parse({ query: 'x', engines: ['nope'] })).toThrow();
  });
});
