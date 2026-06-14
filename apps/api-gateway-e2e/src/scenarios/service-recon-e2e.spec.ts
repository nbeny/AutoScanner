/**
 * Phase 8.3 acceptance: service-recon template end-to-end.
 *
 * Double opt-in: skips unless the three base creds are set AND
 * SERVICE_RECON_E2E=1. Keeps this active service-probing chain
 * (smtp-recon + snmp-recon + smb-enum + api-discovery) out of the shared
 * recon CI job; run it in a dedicated job with the full stack + Docker
 * daemon and the scanner images available:
 *   autoscanner/smtp-recon:1.0    (nmap NSE)
 *   autoscanner/snmp-recon:1.0   (onesixtyone + snmpwalk)
 *   autoscanner/smb-enum:1.0     (enum4linux-ng)
 *   autoscanner/api-discovery:1.0 (kiterunner)
 *
 * Required env:
 *   E2E_API_URL           e.g. http://localhost:4000
 *   E2E_EMAIL             existing operator email
 *   E2E_PASSWORD          existing operator password
 *   SERVICE_RECON_E2E     must be "1" or "true" to opt-in
 *
 * Optional env:
 *   E2E_SERVICE_TARGET         default: scanme.nmap.org
 *   E2E_SERVICE_RECON_TIMEOUT_MS  default: 600000 (10 min)
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
const target = process.env['E2E_SERVICE_TARGET'] ?? 'scanme.nmap.org';
const templateName = 'service-recon';
const templateTimeoutMs = Number(process.env['E2E_SERVICE_RECON_TIMEOUT_MS'] ?? 600_000);

// Double opt-in gate: the three base creds + SERVICE_RECON_E2E=1.
const serviceReconEnabled = ['1', 'true'].includes(process.env['SERVICE_RECON_E2E'] ?? '');
const describeServiceRecon = serviceReconEnabled ? describeOrSkipE2E(env) : describe.skip;

// ── suite ────────────────────────────────────────────────────────────────────

describeServiceRecon('Phase 8.3 — service-recon end-to-end', () => {
  let gql: GraphQLClient;
  let engagementId: string;

  beforeAll(async () => {
    const auth = await restLogin(env.apiUrl!, env.email!, env.password!);
    gql = authedGqlClient(env.apiUrl!, auth.accessToken);
    const { engagementId: id } = await createEngagementWithWildcardScope(gql, {
      namePrefix: 'service-recon',
      clientName: 'service-recon',
      target,
    });
    engagementId = id;
  }, 60_000);

  it(
    'runs service-recon template to COMPLETED and logs soft-signal counts',
    async () => {
      // ── Step 1: start the template run ────────────────────────────────────
      const run = await runTemplate(gql, { engagementId, templateName, target });
      expect(run.id).toBeTruthy();

      // ── Step 2: poll until terminal ───────────────────────────────────────
      const terminal = await pollTemplateRun(gql, run.id, templateTimeoutMs);

      // Hard assertion: the run must complete (not FAILED / CANCELLED).
      expect(terminal.status).toBe('COMPLETED');

      // ── Step 3: soft signals — log counts, never fail ─────────────────────
      // Findings (smtp-recon open-relay / snmp community / smb null-session)
      const findingsRes = await gql.request<{
        findings: Array<{ id: string; title: string; severity: string }>;
      }>(
        /* GraphQL */ `
          query ServiceReconFindings($engagementId: ID!) {
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
        `[service-recon] findings: ${findingsRes.findings.length} (soft — zero acceptable if no vulnerable services)`,
      );

      // Endpoints (api-discovery kiterunner routes)
      const endpointsRes = await gql.request<{
        endpoints: Array<{ id: string; url: string }>;
      }>(
        /* GraphQL */ `
          query ServiceReconEndpoints($engagementId: ID!) {
            endpoints(engagementId: $engagementId) {
              id
              url
            }
          }
        `,
        { engagementId },
      );
      console.info(
        `[service-recon] endpoints: ${endpointsRes.endpoints.length} (soft — zero acceptable if no API routes found)`,
      );

      // OrgMetadata (smtp-recon banners / snmp sysDescr / smb host info)
      const orgMetaRes = await gql.request<{
        orgMetadata: Array<{ id: string; kind: string; source: string }>;
      }>(
        /* GraphQL */ `
          query ServiceReconOrgMeta($engagementId: ID!) {
            orgMetadata(engagementId: $engagementId) {
              id
              kind
              source
            }
          }
        `,
        { engagementId },
      );
      console.info(
        `[service-recon] orgMetadata: ${orgMetaRes.orgMetadata.length} (soft — zero acceptable if no services open)`,
      );

      // ── Step 4: summary ───────────────────────────────────────────────────
      console.info(
        `[service-recon] summary — status=${terminal.status} ` +
          `findings=${findingsRes.findings.length} ` +
          `endpoints=${endpointsRes.endpoints.length} ` +
          `orgMetadata=${orgMetaRes.orgMetadata.length}`,
      );
    },
    templateTimeoutMs + 60_000,
  );
});
