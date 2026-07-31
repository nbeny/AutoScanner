import type { TemplateDefinition } from '../types';

/**
 * Phase 14A — Deep JS/SPA/API reconnaissance.
 *
 * Three parallel branches off the engagement target after the httpx probe:
 *   - JS branch:       subjs → [linkfinder + jsluice]
 *   - API brute:       kiterunner (routes-large.kite, conservative defaults)
 *   - GraphQL branch:  graphw00f (-d auto-discovery) → graphql-cop (only if endpoint confirmed)
 *
 * Target-tolerant fan-out for graphql-cop:
 *   graphw00f-json emits an Endpoint when it confirms a GraphQL path. The parser-worker
 *   persists the row; ContextBuilder resolves `path: 'endpoints'` to the merged set
 *   of every Endpoint for the engagement (JS files, kiterunner hits, GraphQL paths).
 *   graphql-cop is therefore invoked once per discovered endpoint regardless of whether
 *   each is actually a GraphQL endpoint — it simply emits no Finding for non-GraphQL
 *   URLs. A future iteration could narrow this to a typed-Endpoint filter; for now the
 *   no-op cost on non-GraphQL URLs is accepted.
 *
 * Rate-limit acknowledgement: kiterunner uses maxConnPerHost=3 by default, but on
 * shared/aggressive targets the operator must opt-in via the banner below.
 *
 * Phase (breach/auth modern scanners) — appends mantra (secret-hunting over the
 * discovered endpoints), then oauth-oidc + saml-recon (auth-protocol misconfig
 * probes against the engagement root).
 */
export const WebApiDeep: TemplateDefinition = {
  name: 'web-api-deep',
  displayName: 'Web API Deep',
  description:
    'Deep API recon: httpx probe → subjs JS discovery → linkfinder + jsluice URL/secret extraction → ' +
    'kiterunner large-wordlist API brute → graphw00f GraphQL discovery → graphql-cop audit → ' +
    'mantra secret-hunting → oauth-oidc + saml-recon auth-protocol misconfig checks. ' +
    'kiterunner generates significant request volume.',
  scopeAcknowledgement:
    'kiterunner runs an API endpoint brute-force pass with ~970k routes. ' +
    'Verify the engagement scope explicitly allows automated rate-limit testing before launching.',
  steps: [
    {
      scannerName: 'httpx',
      inputs: { techDetect: { kind: 'static', value: true } },
      target: { kind: 'context', path: 'subdomains' },
    },
    { scannerName: 'subjs', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'linkfinder', inputs: {}, target: { kind: 'context', path: 'endpoints' } },
    { scannerName: 'jsluice', inputs: {}, target: { kind: 'context', path: 'endpoints' } },
    { scannerName: 'kiterunner', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'graphw00f', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'graphql-cop', inputs: {}, target: { kind: 'context', path: 'endpoints' } },
    { scannerName: 'mantra', inputs: {}, target: { kind: 'context', path: 'endpoints' } },
    { scannerName: 'oauth-oidc', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'saml-recon', inputs: {}, target: { kind: 'context', path: 'target' } },
  ],
};
