import { GitleaksScanner } from '../gitleaks.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };

describe('GitleaksScanner', () => {
  it('declares image, JSON file → gitleaks-json, produces Finding', () => {
    expect(GitleaksScanner.name).toBe('gitleaks');
    expect(GitleaksScanner.docker.image).toBe('autoscanner/gitleaks:1.0');
    // gitleaks needs a writable detector cache; rootfs is intentionally NOT readonly
    // (clone + report still land in tmpfs /tmp).
    expect(GitleaksScanner.docker.readonlyRootfs).toBe(false);
    expect(GitleaksScanner.docker.defaultTimeoutMs).toBe(1_800_000);
    expect(GitleaksScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: { path: '/tmp/gitleaks-report.json' },
      parser: 'gitleaks-json',
    });
    expect(GitleaksScanner.produces).toEqual(['Finding']);
  });

  it('build() clones the public repo into /tmp/clone and runs gitleaks detect', () => {
    const input = GitleaksScanner.inputSchema.parse({
      source: { type: 'url', repo: 'https://github.com/octocat/Hello-World' },
    });
    const { cmd } = GitleaksScanner.build(input, 'example.com', ctx);
    expect(cmd[0]).toBe('sh');
    expect(cmd[2]).toContain(
      "git clone --depth 1 'https://github.com/octocat/Hello-World' /tmp/clone",
    );
    expect(cmd[2]).toContain('gitleaks detect --source /tmp/clone');
    expect(cmd[2]).toContain('--report-format json');
    expect(cmd[2]).toContain('--report-path /tmp/gitleaks-report.json');
  });

  it('build() refuses an org scan when no GITHUB_TOKEN is configured', () => {
    const input = GitleaksScanner.inputSchema.parse({
      source: { type: 'org', name: 'acme-corp' },
    });
    const { cmd } = GitleaksScanner.build(input, 'example.com', ctx);
    // The script must guard on $GITHUB_TOKEN before doing any enumeration.
    expect(cmd[2]).toContain('if [ -z "$GITHUB_TOKEN" ]');
    expect(cmd[2]).toContain('refusing org scan');
    expect(cmd[2]).toContain('exit 0');
  });

  it('build() enumerates org repos when token present and loops gitleaks detect', () => {
    const input = GitleaksScanner.inputSchema.parse({
      source: { type: 'org', name: 'acme-corp', githubToken: 'op-supplied' },
    });
    const { cmd } = GitleaksScanner.build(input, 'example.com', ctx);
    expect(cmd[2]).toContain("api.github.com/orgs/'acme-corp'/repos");
    expect(cmd[2]).toContain('Authorization: token $GITHUB_TOKEN');
    expect(cmd[2]).toContain('gitleaks detect --source /tmp/clone');
  });

  it('rejects malformed repo URLs and org names via Zod', () => {
    expect(() =>
      GitleaksScanner.inputSchema.parse({ source: { type: 'url', repo: 'not-a-url' } }),
    ).toThrow();
    expect(() =>
      GitleaksScanner.inputSchema.parse({ source: { type: 'org', name: 'a; rm -rf /' } }),
    ).toThrow();
  });
});
