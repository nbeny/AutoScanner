import { GithubSubdomainsScanner } from '../github-subdomains.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };

describe('GithubSubdomainsScanner', () => {
  it('requires the GITHUB credential injected as GITHUB_TOKEN; outputs host lines', () => {
    expect(GithubSubdomainsScanner.name).toBe('github-subdomains');
    expect(GithubSubdomainsScanner.requiresCredential).toBe('GITHUB');
    expect(GithubSubdomainsScanner.credentialEnvVar).toBe('GITHUB_TOKEN');
    expect(GithubSubdomainsScanner.outputs[0].parser).toBe('hostlines-text');
    expect(GithubSubdomainsScanner.produces).toEqual(expect.arrayContaining(['Subdomain']));
  });

  it('build() passes the token env var and quotes the domain', () => {
    const { cmd } = GithubSubdomainsScanner.build(
      GithubSubdomainsScanner.inputSchema.parse({}),
      'example.com',
      ctx,
    );
    expect(cmd[2]).toContain('"$GITHUB_TOKEN"');
    expect(cmd[2]).toContain("-d 'example.com'");
  });
});
