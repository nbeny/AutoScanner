/**
 * Phase 8.5 acceptance: network-vuln template end-to-end.
 *
 * Double opt-in: skips unless the three base creds are set AND
 * OPENVAS_E2E=1. Keeps the Greenbone/OpenVAS network-vulnerability
 * scan chain out of the shared CI job; run it in a dedicated job
 * with the full stack + Docker daemon, the Greenbone compose stack
 * running, and a feed-loaded openvasd:
 *
 *   docker/greenbone/docker-compose.greenbone.yml  (Greenbone stack)
 *   autoscanner/openvas-scan:1.0                   (scan-worker client image)
 *
 * Prerequisites:
 *   1. Greenbone compose stack up:
 *        docker compose -f docker/greenbone/docker-compose.greenbone.yml up -d
 *   2. Feed sync complete — openvasd must have a loaded NVT/SCAP feed before
 *      scans will produce results (initial sync can take 30–90 min).
 *   3. An `OPENVAS` operator credential configured for the engagement owner
 *      (stored in AutoScanner; scan-worker injects the openvasd API key into
 *      the container via the `OPENVAS_API_KEY` env var).
 *   4. The scan-worker container / process must be reachable on the
 *      `autoscanner-greenbone` Docker network so it can talk to openvasd.
 *
 * Required env:
 *   E2E_API_URL           e.g. http://localhost:4000
 *   E2E_EMAIL             existing operator email
 *   E2E_PASSWORD          existing operator password
 *   OPENVAS_E2E           must be "1" or "true" to opt-in
 *
 * Optional env:
 *   E2E_NETWORK_VULN_TARGET       default: 192.168.1.0/24
 *   E2E_NETWORK_VULN_TIMEOUT_MS   default: 1_900_000 (~31 min, exceeds the
 *                                  scanner's 30-min internal budget)
 */

import type { GraphQLClient } from 'graphql-request';
import {
  authedGqlClient,
  createEngagementWithWildcardScope,
  describeOrSkipE2E,
  pollTemplateRun,
  readBaseEnv,
  restLogin,
  runTemplate,
} from '../helpers';

// ── env ─────────────────────────────────────────────────────────────────────

const env = readBaseEnv();
const target = process.env['E2E_NETWORK_VULN_TARGET'] ?? '192.168.1.0/24';
const templateName = 'network-vuln';
const templateTimeoutMs = Number(process.env['E2E_NETWORK_VULN_TIMEOUT_MS'] ?? 1_900_000);

// Double opt-in gate: the three base creds + OPENVAS_E2E=1.
const openvasEnabled = ['1', 'true'].includes(process.env['OPENVAS_E2E'] ?? '');
const describeNetworkVuln = openvasEnabled ? describeOrSkipE2E(env) : describe.skip;

// ── suite ────────────────────────────────────────────────────────────────────

describeNetworkVuln('Phase 8.5 — network-vuln end-to-end', () => {
  let gql: GraphQLClient;
  let engagementId: string;

  beforeAll(async () => {
    const auth = await restLogin(env.apiUrl!, env.email!, env.password!);
    gql = authedGqlClient(env.apiUrl!, auth.accessToken);
    const { engagementId: id } = await createEngagementWithWildcardScope(gql, {
      namePrefix: 'network-vuln',
      clientName: 'network-vuln',
      target,
    });
    engagementId = id;
  }, 60_000);

  it(
    'runs network-vuln template to COMPLETED and logs soft-signal counts',
    async () => {
      // ── Step 1: start the template run ────────────────────────────────────
      const run = await runTemplate(gql, { engagementId, templateName, target });
      expect(run.id).toBeTruthy();

      // ── Step 2: poll until terminal ───────────────────────────────────────
      const terminal = await pollTemplateRun(gql, run.id, templateTimeoutMs);

      // Hard assertion: the run must complete (not FAILED / CANCELLED).
      expect(terminal.status).toBe('COMPLETED');

      // ── Step 3: soft signals — log counts, never fail ─────────────────────
      // Findings depend entirely on what hosts/services are reachable on the
      // target network; zero findings is acceptable for a clean/isolated range.
      const findingsRes = await gql.request<{
        findings: Array<{ id: string; title: string; severity: string }>;
      }>(
        /* GraphQL */ `
          query NetworkVulnFindings($engagementId: ID!) {
            findings(engagementId: $engagementId) {
              id
              title
              severity
            }
          }
        `,
        { engagementId },
      );
      console.info(
        `[network-vuln] findings: ${findingsRes.findings.length} (soft — zero acceptable if target network has no vulnerable hosts)`,
      );

      // ── Step 4: summary ───────────────────────────────────────────────────
      console.info(
        `[network-vuln] summary — status=${terminal.status} ` +
          `findings=${findingsRes.findings.length}`,
      );
    },
    templateTimeoutMs + 60_000,
  );
});
