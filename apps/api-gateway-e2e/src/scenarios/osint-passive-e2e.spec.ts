/**
 * Phase 6.3 acceptance: osint-passive template end-to-end.
 *
 * Double opt-in: skips unless the three base creds are set AND
 * E2E_RUN_OSINT is truthy. The extra gate keeps this heavy chain
 * (crtsh certificate-transparency lookup + whois, run twice for
 * idempotency) out of the shared recon-passive CI job, whose poll budget
 * is tuned for the lighter Phase 2 template. Enable it in a dedicated run
 * with a generous E2E_OSINT_TIMEOUT_MS.
 *
 * Assumes the full stack is running (api-gateway + scan-worker +
 * parser-worker + orchestrator-worker + Docker daemon) with:
 *   - whois + crtsh custom images built via `pnpm scanners:build`
 *
 * Required env: E2E_API_URL, E2E_EMAIL, E2E_PASSWORD, E2E_RUN_OSINT=1
 * Optional: E2E_TEMPLATE_TARGET (default hackerone.com),
 *           E2E_OSINT_TIMEOUT_MS (default 600000)
 */

import type { GraphQLClient } from 'graphql-request';
import {
  authedGqlClient,
  createEngagementWithWildcardScope,
  describeOrSkipE2E,
  filterAssetsByType,
  orgMetadataByEngagement,
  pollTemplateRun,
  queryAssetsFull,
  readBaseEnv,
  restLogin,
  runTemplate,
} from '../helpers';

const env = readBaseEnv();
const target = process.env['E2E_TEMPLATE_TARGET'] ?? 'hackerone.com';
const templateName = 'osint-passive';
const templateTimeoutMs = Number(process.env['E2E_OSINT_TIMEOUT_MS'] ?? 600_000);

// Extra opt-in gate (see file header): this heavy chain must not run in the
// shared recon-passive CI job. Skip unless explicitly enabled.
const enabled = ['1', 'true'].includes(process.env['E2E_RUN_OSINT'] ?? '');
const describeOsint = enabled ? describeOrSkipE2E(env) : describe.skip;

describeOsint('Phase 6.3 — osint-passive end-to-end', () => {
  let gql: GraphQLClient;
  let engagementId: string;

  beforeAll(async () => {
    const auth = await restLogin(env.apiUrl!, env.email!, env.password!);
    gql = authedGqlClient(env.apiUrl!, auth.accessToken);
    const { engagementId: id } = await createEngagementWithWildcardScope(gql, {
      namePrefix: 'e2e-osint-passive',
      clientName: 'e2e-client',
      target,
    });
    engagementId = id;
  }, 60_000);

  it(
    'discovers subdomains (crtsh) and org metadata (whois) and is idempotent',
    async () => {
      // First run
      const firstRun = await runTemplate(gql, { engagementId, templateName, target });
      expect(firstRun.id).toBeTruthy();
      const firstTerminal = await pollTemplateRun(gql, firstRun.id, templateTimeoutMs);
      expect(firstTerminal.status).toBe('COMPLETED');

      // Assert: crtsh discovered at least one SUBDOMAIN asset
      const firstAssets = await queryAssetsFull(gql, engagementId);
      const firstSubdomains = filterAssetsByType(firstAssets, 'SUBDOMAIN');
      expect(firstSubdomains.length).toBeGreaterThanOrEqual(1);

      // Assert: whois produced at least one OrgMetadata record
      const firstOrgMeta = await orgMetadataByEngagement(gql, engagementId);
      expect(firstOrgMeta.length).toBeGreaterThanOrEqual(1);

      // Idempotence: re-run, poll COMPLETED, re-query
      const secondRun = await runTemplate(gql, { engagementId, templateName, target });
      expect(secondRun.id).toBeTruthy();
      expect(secondRun.id).not.toBe(firstRun.id);
      const secondTerminal = await pollTemplateRun(gql, secondRun.id, templateTimeoutMs);
      expect(secondTerminal.status).toBe('COMPLETED');

      // Subdomain canonical set must not shrink
      const secondAssets = await queryAssetsFull(gql, engagementId);
      const secondSubdomains = filterAssetsByType(secondAssets, 'SUBDOMAIN');
      expect(secondSubdomains.length).toBeGreaterThanOrEqual(firstSubdomains.length);

      // OrgMetadata count must not shrink
      const secondOrgMeta = await orgMetadataByEngagement(gql, engagementId);
      expect(secondOrgMeta.length).toBeGreaterThanOrEqual(firstOrgMeta.length);
    },
    templateTimeoutMs * 2 + 60_000,
  );
});
