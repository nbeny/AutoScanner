import { OauthOidcJsonParser } from '../oauth-oidc-json.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'oauth-oidc',
  target: 'https://sso.example.com',
  engagementId: 'e',
};

describe('OauthOidcJsonParser', () => {
  const parser = new OauthOidcJsonParser();

  it('maps each probe finding to a NormalizedFinding at the metadata URL', async () => {
    const report = JSON.stringify({
      issuer: 'https://sso.example.com',
      metadataUrl: 'https://sso.example.com/.well-known/openid-configuration',
      findings: [
        {
          id: 'implicit-flow',
          severity: 'MEDIUM',
          title: 'Implicit flow enabled',
          detail: 'token in response_types',
        },
        {
          id: 'no-pkce',
          severity: 'MEDIUM',
          title: 'PKCE not advertised',
          detail: 'no code_challenge_methods',
        },
      ],
    });
    const out = await parser.parse(report, ctx);
    expect(out.findings).toHaveLength(2);
    expect(out.findings[0]).toMatchObject({
      scannerName: 'oauth-oidc',
      title: 'Implicit flow enabled',
      severity: 'MEDIUM',
      location: 'https://sso.example.com/.well-known/openid-configuration',
    });
  });

  it('returns no findings for a clean issuer', async () => {
    const out = await parser.parse(
      JSON.stringify({ issuer: 'x', metadataUrl: 'x', findings: [] }),
      ctx,
    );
    expect(out.findings).toEqual([]);
  });

  it('returns empty output on unreachable/empty probe output', async () => {
    const out = await parser.parse('', ctx);
    expect(out.findings).toEqual([]);
  });

  it('returns empty output when the JSON is null', async () => {
    const out = await parser.parse('null', ctx);
    expect(out.findings).toEqual([]);
  });

  it('clamps an unknown severity to INFO', async () => {
    const report = JSON.stringify({
      metadataUrl: 'u',
      findings: [{ id: 'x', severity: 'WAT', title: 't' }],
    });
    const out = await parser.parse(report, ctx);
    expect(out.findings[0].severity).toBe('INFO');
  });
});
