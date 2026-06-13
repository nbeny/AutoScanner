/**
 * Phase 6.2 acceptance: web-content template end-to-end.
 *
 * Double opt-in: skips unless the three base creds are set AND
 * E2E_RUN_WEB_CONTENT is truthy. The extra gate keeps this heavy chain
 * (katana crawl + gau passive URLs + ffuf directory brute-force, run twice
 * for idempotency) out of the shared recon-passive CI job, whose poll budget
 * is tuned for the lighter Phase 2 template. Enable it in a dedicated run
 * with a generous E2E_WEB_CONTENT_TIMEOUT_MS.
 *
 * Assumes the full stack is running (api-gateway + scan-worker +
 * parser-worker + orchestrator-worker + Docker daemon) with:
 *   - katana image pulled: projectdiscovery/katana:v1.6.1 (registry)
 *   - gau + ffuf custom images built via `pnpm scanners:build`
 *
 * Required env: E2E_API_URL, E2E_EMAIL, E2E_PASSWORD, E2E_RUN_WEB_CONTENT=1
 * Optional: E2E_TEMPLATE_TARGET (default hackerone.com),
 *           E2E_WEB_CONTENT_TIMEOUT_MS (default 900000)
 */

import type { GraphQLClient } from 'graphql-request';
import {
  authedGqlClient,
  createEngagementWithWildcardScope,
  describeOrSkipE2E,
  endpointsByEngagement,
  pollTemplateRun,
  readBaseEnv,
  restLogin,
  runTemplate,
} from '../helpers';

const env = readBaseEnv();
const target = process.env['E2E_TEMPLATE_TARGET'] ?? 'hackerone.com';
const templateName = 'web-content';
const templateTimeoutMs = Number(process.env['E2E_WEB_CONTENT_TIMEOUT_MS'] ?? 900_000);

// Extra opt-in gate (see file header): this heavy chain must not run in the
// shared recon-passive CI job. Skip unless explicitly enabled.
const enabled = ['1', 'true'].includes(process.env['E2E_RUN_WEB_CONTENT'] ?? '');
const describeWeb = enabled ? describeOrSkipE2E(env) : describe.skip;

describeWeb('Phase 6.2 — web-content end-to-end', () => {
  let gql: GraphQLClient;
  let engagementId: string;

  beforeAll(async () => {
    const auth = await restLogin(env.apiUrl!, env.email!, env.password!);
    gql = authedGqlClient(env.apiUrl!, auth.accessToken);
    const { engagementId: id } = await createEngagementWithWildcardScope(gql, {
      namePrefix: 'e2e-web-content',
      clientName: 'e2e-client',
      target,
    });
    engagementId = id;
  }, 60_000);

  it(
    'discovers endpoints from >=2 sources and is idempotent',
    async () => {
      // First run
      const firstRun = await runTemplate(gql, { engagementId, templateName, target });
      expect(firstRun.id).toBeTruthy();
      const firstTerminal = await pollTemplateRun(gql, firstRun.id, templateTimeoutMs);
      expect(firstTerminal.status).toBe('COMPLETED');

      const eps = await endpointsByEngagement(gql, engagementId);
      expect(eps.length).toBeGreaterThanOrEqual(1);

      const distinctSources = new Set(eps.map((e) => e.source));
      expect(distinctSources.size).toBeGreaterThanOrEqual(2);

      // Idempotence: re-run, poll COMPLETED, re-query
      const secondRun = await runTemplate(gql, { engagementId, templateName, target });
      expect(secondRun.id).toBeTruthy();
      expect(secondRun.id).not.toBe(firstRun.id);
      const secondTerminal = await pollTemplateRun(gql, secondRun.id, templateTimeoutMs);
      expect(secondTerminal.status).toBe('COMPLETED');

      const secondEps = await endpointsByEngagement(gql, engagementId);
      // No shrink: the canonical set must not lose endpoints
      expect(secondEps.length).toBeGreaterThanOrEqual(eps.length);

      // Relaxed canonical stability: every URL from the first run is still present
      const secondUrls = new Set(secondEps.map((e) => e.url));
      for (const ep of eps) {
        expect(secondUrls.has(ep.url)).toBe(true);
      }
    },
    templateTimeoutMs * 2 + 60_000,
  );
});
