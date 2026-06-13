/**
 * Phase 6.4 acceptance: web-fingerprint template end-to-end.
 *
 * Double opt-in: skips unless the three base creds are set AND
 * E2E_RUN_WEB_FINGERPRINT is truthy. The extra gate keeps this heavy chain
 * (tlsx TLS fingerprinting + whatweb technology detection, run twice for
 * idempotency) out of the shared recon-passive CI job, whose poll budget is
 * tuned for the lighter Phase 2 template. Enable it in a dedicated run with
 * a generous E2E_WEB_FINGERPRINT_TIMEOUT_MS.
 *
 * Assumes the full stack is running (api-gateway + scan-worker +
 * parser-worker + orchestrator-worker + Docker daemon) with:
 *   - tlsx registry image pulled: docker pull projectdiscovery/tlsx:v1.2.2
 *   - whatweb custom image built via `pnpm scanners:build`
 *
 * Required env: E2E_API_URL, E2E_EMAIL, E2E_PASSWORD,
 *               E2E_RUN_WEB_FINGERPRINT=1
 * Optional: E2E_TEMPLATE_TARGET (default hackerone.com),
 *           E2E_WEB_FINGERPRINT_TIMEOUT_MS (default 600000)
 */

import type { GraphQLClient } from 'graphql-request';
import {
  authedGqlClient,
  createEngagementWithWildcardScope,
  describeOrSkipE2E,
  filterAssetsByType,
  pollTemplateRun,
  queryAssetsFull,
  readBaseEnv,
  restLogin,
  runTemplate,
  tlsCertificatesByEngagement,
  totalTechnologies,
} from '../helpers';

const env = readBaseEnv();
const target = process.env['E2E_TEMPLATE_TARGET'] ?? 'hackerone.com';
const templateName = 'web-fingerprint';
const templateTimeoutMs = Number(process.env['E2E_WEB_FINGERPRINT_TIMEOUT_MS'] ?? 600_000);

// Extra opt-in gate (see file header): this heavy chain must not run in the
// shared recon-passive CI job. Skip unless explicitly enabled.
const enabled = ['1', 'true'].includes(process.env['E2E_RUN_WEB_FINGERPRINT'] ?? '');
const describeFp = enabled ? describeOrSkipE2E(env) : describe.skip;

describeFp('Phase 6.4 — web-fingerprint end-to-end', () => {
  let gql: GraphQLClient;
  let engagementId: string;

  beforeAll(async () => {
    const auth = await restLogin(env.apiUrl!, env.email!, env.password!);
    gql = authedGqlClient(env.apiUrl!, auth.accessToken);
    const { engagementId: id } = await createEngagementWithWildcardScope(gql, {
      namePrefix: 'e2e-web-fingerprint',
      clientName: 'e2e-client',
      target,
    });
    engagementId = id;
  }, 60_000);

  it(
    'discovers TLS certificates (tlsx) and technologies (whatweb) and is idempotent',
    async () => {
      // ---- First run -------------------------------------------------
      const firstRun = await runTemplate(gql, { engagementId, templateName, target });
      expect(firstRun.id).toBeTruthy();
      const firstTerminal = await pollTemplateRun(gql, firstRun.id, templateTimeoutMs);
      expect(firstTerminal.status).toBe('COMPLETED');

      // Assert: tlsx discovered at least one TlsCertificate
      const firstCerts = await tlsCertificatesByEngagement(gql, engagementId);
      expect(firstCerts.length).toBeGreaterThanOrEqual(1);

      // Assert: whatweb produced at least one Technology across SUBDOMAIN assets
      const firstAssets = await queryAssetsFull(gql, engagementId);
      const firstSubdomains = filterAssetsByType(firstAssets, 'SUBDOMAIN');
      const firstTechCount = totalTechnologies(firstSubdomains);
      expect(firstTechCount).toBeGreaterThanOrEqual(1);

      // ---- Second run (idempotence) ----------------------------------
      const secondRun = await runTemplate(gql, { engagementId, templateName, target });
      expect(secondRun.id).toBeTruthy();
      expect(secondRun.id).not.toBe(firstRun.id);
      const secondTerminal = await pollTemplateRun(gql, secondRun.id, templateTimeoutMs);
      expect(secondTerminal.status).toBe('COMPLETED');

      // TlsCertificate count must not shrink (parser is upsert-only)
      const secondCerts = await tlsCertificatesByEngagement(gql, engagementId);
      expect(secondCerts.length).toBeGreaterThanOrEqual(firstCerts.length);

      // Technology count must not shrink across subdomains
      const secondAssets = await queryAssetsFull(gql, engagementId);
      const secondSubdomains = filterAssetsByType(secondAssets, 'SUBDOMAIN');
      const secondTechCount = totalTechnologies(secondSubdomains);
      expect(secondTechCount).toBeGreaterThanOrEqual(firstTechCount);
    },
    // outer Jest timeout: 2× template timeout + 60s overhead.
    templateTimeoutMs * 2 + 60_000,
  );
});
