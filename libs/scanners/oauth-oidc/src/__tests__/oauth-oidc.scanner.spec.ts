import { OauthOidcScanner } from '../oauth-oidc.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('OauthOidcScanner', () => {
  it('declares name, image, JSON file → oauth-oidc-json, produces Finding', () => {
    expect(OauthOidcScanner.name).toBe('oauth-oidc');
    expect(OauthOidcScanner.docker.image).toBe('autoscanner/oauth-oidc:1.0');
    expect(OauthOidcScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: { path: '/out/result.json' },
      parser: 'oauth-oidc-json',
    });
    expect(OauthOidcScanner.produces).toEqual(['Finding']);
  });

  it('build() runs oidc-probe against the target base URL', () => {
    const input = OauthOidcScanner.inputSchema.parse({});
    const { cmd } = OauthOidcScanner.build(input, 'https://sso.example.com', ctx);
    expect(cmd[0]).toBe('sh');
    expect(cmd[1]).toBe('-lc');
    expect(cmd[2]).toContain('oidc-probe');
    expect(cmd[2]).toContain("'https://sso.example.com'");
    expect(cmd[2]).toContain('/out/result.json');
  });

  it('build() prefers an explicit issuer over target', () => {
    const input = OauthOidcScanner.inputSchema.parse({ issuer: 'https://id.example/realms/x' });
    const { cmd } = OauthOidcScanner.build(input, 'https://ignored/', ctx);
    expect(cmd[2]).toContain("'https://id.example/realms/x'");
    expect(cmd[2]).not.toContain('ignored');
  });

  it('rejects a non-URL issuer', () => {
    expect(() => OauthOidcScanner.inputSchema.parse({ issuer: 'not a url' })).toThrow();
  });
});
