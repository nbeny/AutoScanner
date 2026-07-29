import { GitDumperScanner } from '../git-dumper.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('GitDumperScanner', () => {
  it('declares name, image, JSON file → git-dumper-json, produces Finding', () => {
    expect(GitDumperScanner.name).toBe('git-dumper');
    expect(GitDumperScanner.docker.image).toBe('autoscanner/git-dumper:1.0');
    expect(GitDumperScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: { path: '/out/result.json' },
      parser: 'git-dumper-json',
    });
    expect(GitDumperScanner.produces).toEqual(['Finding']);
  });

  it('build() runs gitdump-scan against the target', () => {
    const input = GitDumperScanner.inputSchema.parse({});
    const { cmd } = GitDumperScanner.build(input, 'https://victim.example', ctx);
    expect(cmd[0]).toBe('sh');
    expect(cmd[1]).toBe('-lc');
    expect(cmd[2]).toContain('gitdump-scan');
    expect(cmd[2]).toContain("'https://victim.example'");
    expect(cmd[2]).toContain('/out/result.json');
  });

  it('build() prefers an explicit baseUrl over target', () => {
    const input = GitDumperScanner.inputSchema.parse({ baseUrl: 'https://app.example/sub' });
    const { cmd } = GitDumperScanner.build(input, 'https://ignored', ctx);
    expect(cmd[2]).toContain("'https://app.example/sub'");
    expect(cmd[2]).not.toContain('ignored');
  });

  it('rejects a non-URL baseUrl', () => {
    expect(() => GitDumperScanner.inputSchema.parse({ baseUrl: 'nope' })).toThrow();
  });
});
