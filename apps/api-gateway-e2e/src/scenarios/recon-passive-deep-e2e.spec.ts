/**
 * Phase 6.1 acceptance: recon-passive-deep template end-to-end.
 *
 * Double opt-in: skips unless the three base creds are set AND
 * E2E_RUN_RECON_DEEP is truthy. The extra gate keeps this heavy chain (amass
 * passive + puredns brute-force + 4 more steps, run twice for idempotency)
 * out of the shared recon-passive CI job, whose poll budget is tuned for the
 * lighter Phase 2 template. Enable it in a dedicated run with a generous
 * E2E_RECON_DEEP_TIMEOUT_MS.
 *
 * Assumes the full stack is running (api-gateway + scan-worker +
 * parser-worker + orchestrator-worker + Docker daemon) with the four new
 * scanner images available: edu4rdshl/findomain, caffix/amass,
 * autoscanner/assetfinder:1.0, autoscanner/puredns:1.0 (run
 * `pnpm scanners:build` + pre-pull the registry images first).
 *
 * Required env: E2E_API_URL, E2E_EMAIL, E2E_PASSWORD, E2E_RUN_RECON_DEEP=1
 * Optional: E2E_TEMPLATE_TARGET (default hackerone.com),
 *           E2E_RECON_DEEP_TIMEOUT_MS (default 900000),
 *           E2E_SUBDOMAIN_MIN_COUNT (default 5),
 *           E2E_MIN_DISTINCT_SOURCES (default 3)
 */

import type { GraphQLClient } from 'graphql-request';
import {
  assertCanonicalOverlap,
  assertLastSeenRefreshed,
  assertWithinPercent,
  assetScannerSources,
  authedGqlClient,
  createEngagementWithWildcardScope,
  describeOrSkipE2E,
  filterAssetsByType,
  pollTemplateRun,
  queryAssetsFull,
  readBaseEnv,
  restLogin,
  runTemplate,
} from '../helpers';

const env = readBaseEnv();
const target = process.env['E2E_TEMPLATE_TARGET'] ?? 'hackerone.com';
const templateName = 'recon-passive-deep';
const templateTimeoutMs = Number(process.env['E2E_RECON_DEEP_TIMEOUT_MS'] ?? 900_000);
const subdomainMinCount = Number(process.env['E2E_SUBDOMAIN_MIN_COUNT'] ?? 5);
const minDistinctSources = Number(process.env['E2E_MIN_DISTINCT_SOURCES'] ?? 3);

// Extra opt-in gate (see file header): this heavy chain must not run in the
// shared recon-passive CI job. Skip unless explicitly enabled.
const deepEnabled = ['1', 'true'].includes(process.env['E2E_RUN_RECON_DEEP'] ?? '');
const describeDeep = deepEnabled ? describeOrSkipE2E(env) : describe.skip;

describeDeep('Phase 6.1 — recon-passive-deep end-to-end', () => {
  let gql: GraphQLClient;
  let engagementId: string;

  beforeAll(async () => {
    const auth = await restLogin(env.apiUrl!, env.email!, env.password!);
    gql = authedGqlClient(env.apiUrl!, auth.accessToken);
    const { engagementId: id } = await createEngagementWithWildcardScope(gql, {
      namePrefix: 'e2e-recon-deep',
      clientName: 'e2e-client',
      target,
    });
    engagementId = id;
  }, 60_000);

  it(
    'discovers subdomains from >=3 sources, merges them, and is idempotent',
    async () => {
      const firstRun = await runTemplate(gql, { engagementId, templateName, target });
      expect(firstRun.id).toBeTruthy();
      const firstTerminal = await pollTemplateRun(gql, firstRun.id, templateTimeoutMs);
      expect(firstTerminal.status).toBe('COMPLETED');

      const firstAssets = await queryAssetsFull(gql, engagementId);
      const firstSubdomains = filterAssetsByType(firstAssets, 'SUBDOMAIN');
      expect(firstSubdomains.length).toBeGreaterThanOrEqual(subdomainMinCount);

      const sourceSets = await Promise.all(
        firstSubdomains.map((s) => assetScannerSources(gql, s.id)),
      );
      const distinctSources = new Set(sourceSets.flat());
      expect(distinctSources.size).toBeGreaterThanOrEqual(minDistinctSources);
      expect(sourceSets.some((set) => set.length >= 2)).toBe(true);

      const secondRun = await runTemplate(gql, { engagementId, templateName, target });
      expect(secondRun.id).toBeTruthy();
      expect(secondRun.id).not.toBe(firstRun.id);
      const secondTerminal = await pollTemplateRun(gql, secondRun.id, templateTimeoutMs);
      expect(secondTerminal.status).toBe('COMPLETED');

      const secondAssets = await queryAssetsFull(gql, engagementId);
      const secondSubdomains = filterAssetsByType(secondAssets, 'SUBDOMAIN');

      assertWithinPercent(firstSubdomains.length, secondSubdomains.length, 'SUBDOMAIN');
      assertCanonicalOverlap(firstSubdomains, secondSubdomains);
      assertLastSeenRefreshed(firstSubdomains, secondSubdomains);
    },
    templateTimeoutMs * 2 + 60_000,
  );
});
