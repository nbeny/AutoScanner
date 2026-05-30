/**
 * Phase 2 acceptance (Étape 2): web-deep full recon-chain end-to-end.
 *
 * Scenario:
 *  1. Login + create a fresh engagement.
 *  2. Create an INCLUDE WILDCARD_DOMAIN ScopeRule for the target via
 *     the `createScopeRule` mutation.
 *  3. runTemplate({ templateName: 'web-deep', target }) → poll
 *     `templateRun(id)` until COMPLETED (timeout 10min by default — the
 *     full chain subfinder → httpx → dnsx → naabu → nuclei takes longer
 *     than the passive recon step).
 *  4. Assert every persistence table is populated (the whole point of
 *     the acceptance suite):
 *        - Domain assets    ≥ 1
 *        - Subdomain assets ≥ E2E_WEB_DEEP_SUBDOMAIN_MIN (default 5)
 *        - IpAddress assets ≥ 1
 *        - DnsRecord rows   ≥ E2E_WEB_DEEP_DNSRECORD_MIN (default 3)
 *        - Port rows        ≥ 1 (across all assets)
 *        - Technology rows  ≥ 1 (across all assets)
 *        - Findings query   responds (count ≥ 0 — hackerone.com is
 *          well-secured, so we just confirm the query path, not a
 *          minimum count).
 *  5. Idempotence: re-runTemplate with the same params → poll to
 *     COMPLETED → re-query → counts are stable (within ±10% per kind
 *     to absorb upstream-discovery variance from subfinder/dnsx). The
 *     "0 doublon" assertion is implicit: stability across runs means
 *     the @@unique constraints on Subdomain.canonicalValue /
 *     IpAddress.canonicalValue + the per-asset Finding
 *     @@unique([assetId, dedupHash]) successfully deduped the second
 *     pass.
 *  6. Canonical-set overlap ≥ 90% for SUBDOMAIN (same rule as
 *     recon-passive-e2e).
 *
 * Opt-in: skips unless E2E_API_URL + E2E_EMAIL + E2E_PASSWORD are set.
 * Assumes the full stack is running (api-gateway + scan-worker +
 * parser-worker + orchestrator-worker + Docker daemon with subfinder /
 * httpx / dnsx / naabu / nuclei images already pulled).
 *
 * Required env:
 *   E2E_API_URL                       e.g. http://localhost:4000
 *   E2E_EMAIL                         existing operator email
 *   E2E_PASSWORD                      existing operator password
 * Optional:
 *   E2E_WEB_DEEP_TARGET               default: hackerone.com
 *   E2E_WEB_DEEP_TIMEOUT_MS           default: 600000 (10 min)
 *   E2E_WEB_DEEP_SUBDOMAIN_MIN        default: 5
 *   E2E_WEB_DEEP_DNSRECORD_MIN        default: 3
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
  queryDnsRecords,
  queryFindings,
  readBaseEnv,
  restLogin,
  runTemplate,
  totalPorts,
  totalTechnologies,
} from '../helpers';

const env = readBaseEnv();
const target = process.env['E2E_WEB_DEEP_TARGET'] ?? 'hackerone.com';
const templateName = 'web-deep';
const templateTimeoutMs = Number(process.env['E2E_WEB_DEEP_TIMEOUT_MS'] ?? 600_000);
const subdomainMinCount = Number(process.env['E2E_WEB_DEEP_SUBDOMAIN_MIN'] ?? 5);
const dnsRecordMinCount = Number(process.env['E2E_WEB_DEEP_DNSRECORD_MIN'] ?? 3);

describeOrSkipE2E(env)('Phase 2 Étape 2 — web-deep end-to-end (full chain)', () => {
  let gql: GraphQLClient;
  let engagementId: string;

  beforeAll(async () => {
    const auth = await restLogin(env.apiUrl!, env.email!, env.password!);
    gql = authedGqlClient(env.apiUrl!, auth.accessToken);
    const { engagementId: id } = await createEngagementWithWildcardScope(gql, {
      namePrefix: 'e2e-web-deep',
      clientName: 'e2e-client',
      target,
    });
    engagementId = id;
  }, 90_000);

  it(
    'runs web-deep end-to-end, populates every recon table, and is idempotent on a second run',
    async () => {
      // ---- First run -------------------------------------------------
      const firstRun = await runTemplate(gql, { engagementId, templateName, target });
      expect(firstRun.id).toBeTruthy();

      const firstTerminal = await pollTemplateRun(gql, firstRun.id, templateTimeoutMs);
      expect(firstTerminal.status).toBe('COMPLETED');

      const firstAssets = await queryAssetsFull(gql, engagementId);
      const firstDomains = filterAssetsByType(firstAssets, 'DOMAIN');
      const firstSubdomains = filterAssetsByType(firstAssets, 'SUBDOMAIN');
      const firstIps = filterAssetsByType(firstAssets, 'IP_ADDRESS');

      // Every table populated:
      expect(firstDomains.length).toBeGreaterThanOrEqual(1);
      expect(firstSubdomains.length).toBeGreaterThanOrEqual(subdomainMinCount);
      expect(firstIps.length).toBeGreaterThanOrEqual(1);

      const firstDnsRecords = await queryDnsRecords(gql, engagementId);
      expect(firstDnsRecords.length).toBeGreaterThanOrEqual(dnsRecordMinCount);

      const firstPortCount = totalPorts(firstAssets);
      expect(firstPortCount).toBeGreaterThanOrEqual(1);

      const firstTechCount = totalTechnologies(firstAssets);
      expect(firstTechCount).toBeGreaterThanOrEqual(1);

      // Findings query must respond — well-secured targets like
      // hackerone.com can legitimately produce zero findings, so we
      // just assert the path works.
      const firstFindings = await queryFindings(gql, engagementId);
      expect(firstFindings.length).toBeGreaterThanOrEqual(0);

      // ---- Second run (idempotence) ----------------------------------
      const secondRun = await runTemplate(gql, { engagementId, templateName, target });
      expect(secondRun.id).toBeTruthy();
      expect(secondRun.id).not.toBe(firstRun.id);

      const secondTerminal = await pollTemplateRun(gql, secondRun.id, templateTimeoutMs);
      expect(secondTerminal.status).toBe('COMPLETED');

      const secondAssets = await queryAssetsFull(gql, engagementId);
      const secondSubdomains = filterAssetsByType(secondAssets, 'SUBDOMAIN');
      const secondIps = filterAssetsByType(secondAssets, 'IP_ADDRESS');

      const secondDnsRecords = await queryDnsRecords(gql, engagementId);
      const secondPortCount = totalPorts(secondAssets);
      const secondTechCount = totalTechnologies(secondAssets);

      // ±10% stability across all kinds.
      assertWithinPercent(firstSubdomains.length, secondSubdomains.length, 'SUBDOMAIN');
      assertWithinPercent(firstIps.length, secondIps.length, 'IP_ADDRESS');
      assertWithinPercent(firstDnsRecords.length, secondDnsRecords.length, 'DnsRecord');
      assertWithinPercent(firstPortCount, secondPortCount, 'Port');
      assertWithinPercent(firstTechCount, secondTechCount, 'Technology');

      // Canonical-set overlap ≥ 90% for SUBDOMAIN + lastSeenAt advanced.
      assertCanonicalOverlap(firstSubdomains, secondSubdomains);
      assertLastSeenRefreshed(firstSubdomains, secondSubdomains);
    },
    // outer Jest timeout: 2× template timeout + 90s overhead (two runs
    // + setup + teardown).
    templateTimeoutMs * 2 + 90_000,
  );
});
