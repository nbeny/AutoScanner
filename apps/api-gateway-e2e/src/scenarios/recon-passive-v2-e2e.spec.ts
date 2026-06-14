/**
 * Phase 8.1 acceptance: osint-passive-deep template end-to-end.
 *
 * Double opt-in: skips unless the three base creds are set AND
 * RECON_PASSIVE_V2_E2E=1. The extra gate keeps this heavy chain
 * (asnmap + cloud-enum + github-subdomains + trufflehog + securitytrails,
 * some of which require API keys) out of the shared recon CI job.
 * Enable it in a dedicated run with a generous timeout.
 *
 * Assumes the full stack is running (api-gateway + scan-worker +
 * parser-worker + orchestrator-worker + Docker daemon) with the five new
 * scanner images available:
 *   autoscanner/asnmap:1.0
 *   autoscanner/cloud-enum:1.0
 *   autoscanner/github-subdomains:1.0
 *   autoscanner/trufflehog:1.0
 *   autoscanner/securitytrails:1.0
 * (run `pnpm scanners:build` and pull images first).
 *
 * Required env:
 *   E2E_API_URL           e.g. http://localhost:4000
 *   E2E_EMAIL             existing operator email
 *   E2E_PASSWORD          existing operator password
 *   RECON_PASSIVE_V2_E2E  must be "1" or "true" to opt-in
 *
 * Optional env:
 *   E2E_TEMPLATE_TARGET        default: hackerone.com
 *   E2E_PASSIVE_V2_TIMEOUT_MS  default: 600000 (10 min)
 *   E2E_GITHUB_TOKEN           enables github-subdomains scanner; soft assertions when absent
 *   E2E_SECURITYTRAILS_KEY     enables securitytrails scanner; soft assertions when absent
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
const target = process.env['E2E_TEMPLATE_TARGET'] ?? 'hackerone.com';
const templateName = 'osint-passive-deep';
const templateTimeoutMs = Number(process.env['E2E_PASSIVE_V2_TIMEOUT_MS'] ?? 600_000);

// Double opt-in gate: the three base creds + RECON_PASSIVE_V2_E2E=1.
const passiveV2Enabled = ['1', 'true'].includes(process.env['RECON_PASSIVE_V2_E2E'] ?? '');
const describePassiveV2 = passiveV2Enabled ? describeOrSkipE2E(env) : describe.skip;

// ── org-metadata helper (inline GQL — no frontend doc import) ────────────────

interface OrgMetadataRow {
  id: string;
  kind: string;
  source: string;
  data: unknown;
}

async function queryOrgMetadata(
  gql: GraphQLClient,
  engagementId: string,
): Promise<OrgMetadataRow[]> {
  const res = await gql.request<{ orgMetadata: OrgMetadataRow[] }>(
    /* GraphQL */ `
      query OrgMetaV2($engagementId: ID!) {
        orgMetadata(engagementId: $engagementId) {
          id
          kind
          source
          data
        }
      }
    `,
    { engagementId },
  );
  return res.orgMetadata;
}

// ── subdomain helper (inline GQL) ────────────────────────────────────────────

interface SubdomainRow {
  id: string;
  type: string;
  value: string;
}

async function querySubdomains(gql: GraphQLClient, engagementId: string): Promise<SubdomainRow[]> {
  const res = await gql.request<{ assets: SubdomainRow[] }>(
    /* GraphQL */ `
      query AssetsV2($engagementId: ID!) {
        assets(engagementId: $engagementId) {
          id
          type
          value
        }
      }
    `,
    { engagementId },
  );
  return res.assets.filter((a) => a.type === 'SUBDOMAIN');
}

// ── suite ────────────────────────────────────────────────────────────────────

describePassiveV2('Phase 8.1 — osint-passive-deep end-to-end', () => {
  let gql: GraphQLClient;
  let engagementId: string;

  beforeAll(async () => {
    const auth = await restLogin(env.apiUrl!, env.email!, env.password!);
    gql = authedGqlClient(env.apiUrl!, auth.accessToken);
    const { engagementId: id } = await createEngagementWithWildcardScope(gql, {
      namePrefix: 'recon-v2',
      clientName: 'recon-v2',
      target,
    });
    engagementId = id;
  }, 60_000);

  it(
    'runs osint-passive-deep, persists >=1 ASN OrgMetadata row, and soft-asserts credential-gated scanners',
    async () => {
      // ---- Step 1: run the template ----------------------------------------
      const run = await runTemplate(gql, { engagementId, templateName, target });
      expect(run.id).toBeTruthy();

      // ---- Step 2: poll until terminal (COMPLETED / FAILED / CANCELLED) -----
      const terminal = await pollTemplateRun(gql, run.id, templateTimeoutMs);
      expect(terminal.status).toBe('COMPLETED');

      // ---- Step 3: hard assertion — asnmap requires no API key, so we
      //              always expect ≥1 ASN row (the most reliable signal). -----
      const orgMeta = await queryOrgMetadata(gql, engagementId);
      const asnRows = orgMeta.filter((r) => r.kind === 'ASN');
      expect(asnRows.length).toBeGreaterThanOrEqual(1);

      // ---- Step 4: soft assertions for credential-gated scanners ------------

      // github-subdomains: subdomain rows with source='GITHUB'
      const githubToken = process.env['E2E_GITHUB_TOKEN'];
      if (githubToken) {
        const subdomains = await querySubdomains(gql, engagementId);
        const githubSubdomains = subdomains.filter(
          (s) =>
            // Assets don't carry a source field directly — instead we just
            // assert that subdomains were discovered (the scanner runs when the
            // token is present; they feed the shared SUBDOMAIN asset table).
            s.value.endsWith(`.${target}`) || s.value === target,
        );
        console.info(
          `[recon-passive-v2] github-subdomains: ${githubSubdomains.length} subdomains (soft — zero is acceptable)`,
        );
      } else {
        console.info(
          '[recon-passive-v2] E2E_GITHUB_TOKEN absent — skipping github-subdomains subdomain assertion',
        );
      }

      // securitytrails: subdomain rows discovered via securitytrails
      const stKey = process.env['E2E_SECURITYTRAILS_KEY'];
      if (stKey) {
        const subdomains = await querySubdomains(gql, engagementId);
        expect(subdomains.length).toBeGreaterThanOrEqual(1);
        console.info(
          `[recon-passive-v2] securitytrails: ${subdomains.length} total subdomains (post-run)`,
        );
      } else {
        console.info(
          '[recon-passive-v2] E2E_SECURITYTRAILS_KEY absent — skipping securitytrails subdomain assertion',
        );
      }

      // trufflehog: secrets findings — only assertable when GitHub token present
      // (trufflehog scans public GitHub repos belonging to the target org)
      if (githubToken) {
        const findingsRes = await gql.request<{
          findings: Array<{ id: string; title: string; severity: string }>;
        }>(
          /* GraphQL */ `
            query FindingsV2($engagementId: ID!) {
              findings(engagementId: $engagementId) {
                id
                title
                severity
              }
            }
          `,
          { engagementId },
        );
        // Soft: log but do not fail — targets may have no public secrets.
        console.info(
          `[recon-passive-v2] trufflehog: ${findingsRes.findings.length} findings (may be 0 for clean orgs)`,
        );
      }

      // cloud-enum: CLOUD_BUCKET OrgMetadata rows
      const bucketRows = orgMeta.filter((r) => r.kind === 'CLOUD_BUCKET');
      // Soft: targets may have no public cloud buckets.
      console.info(`[recon-passive-v2] cloud-enum: ${bucketRows.length} CLOUD_BUCKET rows`);

      // ---- Step 5: log summary --------------------------------------------
      console.info(
        `[recon-passive-v2] summary — orgMetadata total=${orgMeta.length} ` +
          `ASN=${asnRows.length} CLOUD_BUCKET=${bucketRows.length}`,
      );
    },
    // Generous timeout: one template run + buffer.
    templateTimeoutMs + 60_000,
  );
});
