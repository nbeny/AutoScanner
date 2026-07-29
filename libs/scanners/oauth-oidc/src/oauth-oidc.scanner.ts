import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const OauthOidcInput = z.object({
  issuer: z.string().url().optional(),
});
export type OauthOidcInputType = z.infer<typeof OauthOidcInput>;

function shEscape(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export const OauthOidcScanner: ScannerDefinition<OauthOidcInputType> = {
  name: 'oauth-oidc',
  displayName: 'OAuth/OIDC misconfig',
  category: [ScannerCategory.API_SECURITY],
  description:
    'Probes an OAuth 2.0 / OpenID Connect issuer for misconfiguration: implicit flow enabled, ' +
    'missing PKCE support, and loose redirect_uri handling, via its .well-known metadata.',
  inputSchema: OauthOidcInput,
  docker: {
    image: 'autoscanner/oauth-oidc:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 256,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(input, target) {
    const base = shEscape(input.issuer ?? target);
    return { cmd: ['sh', '-lc', `oidc-probe ${base} > /out/result.json`] };
  },
  outputs: [{ format: 'JSON', capture: { path: '/out/result.json' }, parser: 'oauth-oidc-json' }],
  produces: ['Finding'],
};
