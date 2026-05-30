/**
 * Phase 2 acceptance (Étape 1): recon-passive template end-to-end.
 *
 * Scenario:
 *  1. Login + create a fresh engagement.
 *  2. Create an INCLUDE WILDCARD_DOMAIN ScopeRule for `hackerone.com` via
 *     the `createScopeRule` mutation.
 *  3. runTemplate({ templateName: 'recon-passive', target }) → poll
 *     `templateRun(id)` until COMPLETED (timeout 5min).
 *  4. Assert assets(type=SUBDOMAIN, engagementId) count >= threshold.
 *  5. Assert at least one Asset carries technologies (>=1 across all
 *     subdomains).
 *  6. Idempotence: re-runTemplate with the same params → poll to
 *     COMPLETED → re-query → counts are stable (subdomains stay the same
 *     within ±10% to absorb upstream discovery variance; technologies
 *     never decrease).
 *
 * Opt-in: skips unless E2E_API_URL + E2E_EMAIL + E2E_PASSWORD are set.
 * Assumes the full stack is running (api-gateway + scan-worker +
 * parser-worker + orchestrator-worker + Docker daemon with subfinder /
 * httpx images already pulled).
 *
 * Required env:
 *   E2E_API_URL        e.g. http://localhost:4000
 *   E2E_EMAIL          existing operator email
 *   E2E_PASSWORD       existing operator password
 * Optional:
 *   E2E_TEMPLATE_TARGET           default: hackerone.com
 *   E2E_TEMPLATE_NAME             default: recon-passive
 *   E2E_TEMPLATE_TIMEOUT_MS       default: 300000 (5min)
 *   E2E_SUBDOMAIN_MIN_COUNT       default: 5
 */

import type { GraphQLClient } from 'graphql-request';
import {
  assertCanonicalOverlap,
  assertLastSeenRefreshed,
  assertWithinPercent,
  authedGqlClient,
  createEngagementWithWildcardScope,
  describeOrSkipE2E,
  filterAssetsByType,
  pollTemplateRun,
  queryAssetsFull,
  readBaseEnv,
  restLogin,
  runTemplate,
  totalTechnologies,
} from '../helpers';

const env = readBaseEnv();
const target = process.env['E2E_TEMPLATE_TARGET'] ?? 'hackerone.com';
const templateName = process.env['E2E_TEMPLATE_NAME'] ?? 'recon-passive';
const templateTimeoutMs = Number(process.env['E2E_TEMPLATE_TIMEOUT_MS'] ?? 300_000);
const subdomainMinCount = Number(process.env['E2E_SUBDOMAIN_MIN_COUNT'] ?? 5);

describeOrSkipE2E(env)('Phase 2 Étape 1 — recon-passive end-to-end', () => {
  let gql: GraphQLClient;
  let engagementId: string;

  beforeAll(async () => {
    const auth = await restLogin(env.apiUrl!, env.email!, env.password!);
    gql = authedGqlClient(env.apiUrl!, auth.accessToken);
    const { engagementId: id } = await createEngagementWithWildcardScope(gql, {
      namePrefix: 'e2e-recon',
      clientName: 'e2e-client',
      target,
    });
    engagementId = id;
  }, 60_000);

  it(
    'runs recon-passive, persists >= threshold subdomains + >=1 technology, and is idempotent on a second run',
    async () => {
      // ---- First run -------------------------------------------------
      const firstRun = await runTemplate(gql, { engagementId, templateName, target });
      expect(firstRun.id).toBeTruthy();

      const firstTerminal = await pollTemplateRun(gql, firstRun.id, templateTimeoutMs);
      expect(firstTerminal.status).toBe('COMPLETED');

      const firstAssets = await queryAssetsFull(gql, engagementId);
      const firstSubdomains = filterAssetsByType(firstAssets, 'SUBDOMAIN');
      expect(firstSubdomains.length).toBeGreaterThanOrEqual(subdomainMinCount);

      const firstTechCount = totalTechnologies(firstSubdomains);
      expect(firstTechCount).toBeGreaterThanOrEqual(1);

      // ---- Second run (idempotence) ----------------------------------
      const secondRun = await runTemplate(gql, { engagementId, templateName, target });
      expect(secondRun.id).toBeTruthy();
      expect(secondRun.id).not.toBe(firstRun.id);

      const secondTerminal = await pollTemplateRun(gql, secondRun.id, templateTimeoutMs);
      expect(secondTerminal.status).toBe('COMPLETED');

      const secondAssets = await queryAssetsFull(gql, engagementId);
      const secondSubdomains = filterAssetsByType(secondAssets, 'SUBDOMAIN');

      // Counts stable within ±10% — absorbs subfinder source flakiness.
      assertWithinPercent(firstSubdomains.length, secondSubdomains.length, 'SUBDOMAIN');

      // Canonical set must overlap ≥ 90% and at least one row must have
      // had its lastSeenAt refreshed (proves the parser updated in place).
      assertCanonicalOverlap(firstSubdomains, secondSubdomains);
      assertLastSeenRefreshed(firstSubdomains, secondSubdomains);

      // Technologies never decrease (parser is upsert-only across runs).
      const secondTechCount = totalTechnologies(secondSubdomains);
      expect(secondTechCount).toBeGreaterThanOrEqual(firstTechCount);
    },
    // outer Jest timeout: 2× template timeout + 60s overhead.
    templateTimeoutMs * 2 + 60_000,
  );
});
