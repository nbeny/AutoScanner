/**
 * Phase 8.4 acceptance: vuln-active template end-to-end.
 *
 * Double opt-in: skips unless the three base creds are set AND
 * VULN_ACTIVE_E2E=1. Keeps this active web-vulnerability chain
 * (xss-scan + sqli-scan + cmdi-scan) out of the shared CI job;
 * run it in a dedicated job with the full stack + Docker daemon
 * and the scanner images available:
 *   ghcr.io/hahwul/dalfox:v2.9.4 (xss-scan; public image, reused)
 *   autoscanner/sqli-scan:1.0    (sqlmap)
 *   autoscanner/cmdi-scan:1.0    (commix)
 *
 * Required env:
 *   E2E_API_URL           e.g. http://localhost:4000
 *   E2E_EMAIL             existing operator email
 *   E2E_PASSWORD          existing operator password
 *   VULN_ACTIVE_E2E       must be "1" or "true" to opt-in
 *
 * Optional env:
 *   E2E_VULN_TARGET              default: http://testphp.vulnweb.com
 *   E2E_VULN_ACTIVE_TIMEOUT_MS   default: 600000 (10 min)
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
const target = process.env['E2E_VULN_TARGET'] ?? 'http://testphp.vulnweb.com';
const templateName = 'vuln-active';
const templateTimeoutMs = Number(process.env['E2E_VULN_ACTIVE_TIMEOUT_MS'] ?? 600_000);

// Double opt-in gate: the three base creds + VULN_ACTIVE_E2E=1.
const vulnActiveEnabled = ['1', 'true'].includes(process.env['VULN_ACTIVE_E2E'] ?? '');
const describeVulnActive = vulnActiveEnabled ? describeOrSkipE2E(env) : describe.skip;

// ── suite ────────────────────────────────────────────────────────────────────

describeVulnActive('Phase 8.4 — vuln-active end-to-end', () => {
  let gql: GraphQLClient;
  let engagementId: string;

  beforeAll(async () => {
    const auth = await restLogin(env.apiUrl!, env.email!, env.password!);
    gql = authedGqlClient(env.apiUrl!, auth.accessToken);
    const { engagementId: id } = await createEngagementWithWildcardScope(gql, {
      namePrefix: 'vuln-active',
      clientName: 'vuln-active',
      target,
    });
    engagementId = id;
  }, 60_000);

  it(
    'runs vuln-active template to COMPLETED and logs soft-signal counts',
    async () => {
      // ── Step 1: start the template run ────────────────────────────────────
      const run = await runTemplate(gql, { engagementId, templateName, target });
      expect(run.id).toBeTruthy();

      // ── Step 2: poll until terminal ───────────────────────────────────────
      const terminal = await pollTemplateRun(gql, run.id, templateTimeoutMs);

      // Hard assertion: the run must complete (not FAILED / CANCELLED).
      expect(terminal.status).toBe('COMPLETED');

      // ── Step 3: soft signals — log counts, never fail ─────────────────────
      // Findings (xss-scan XSS / sqli-scan injection / cmdi-scan command injection)
      const findingsRes = await gql.request<{
        findings: Array<{ id: string; title: string; severity: string }>;
      }>(
        /* GraphQL */ `
          query VulnActiveFindings($engagementId: ID!) {
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
        `[vuln-active] findings: ${findingsRes.findings.length} (soft — zero acceptable if target is not vulnerable)`,
      );

      // ── Step 4: summary ───────────────────────────────────────────────────
      console.info(
        `[vuln-active] summary — status=${terminal.status} ` +
          `findings=${findingsRes.findings.length}`,
      );
    },
    templateTimeoutMs + 60_000,
  );
});
