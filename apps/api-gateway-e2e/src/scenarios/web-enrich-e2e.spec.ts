/**
 * Phase 8.2 acceptance: web-enrich template end-to-end.
 *
 * Double opt-in: skips unless the three base creds are set AND
 * WEB_ENRICH_E2E=1. Keeps this active enrichment chain (favicon + wafw00f +
 * cdncheck + js-recon) out of the shared recon CI job; run it in a dedicated
 * job with the full stack + Docker daemon and the scanner images available:
 *   projectdiscovery/httpx:v1.9.0   (favicon reuses this image)
 *   autoscanner/wafw00f:1.0
 *   autoscanner/cdncheck:1.0
 *   autoscanner/js-recon:1.0
 *
 * Required env:
 *   E2E_API_URL       e.g. http://localhost:4000
 *   E2E_EMAIL         existing operator email
 *   E2E_PASSWORD      existing operator password
 *   WEB_ENRICH_E2E    must be "1" or "true" to opt-in
 *
 * Optional env:
 *   E2E_WEB_ENRICH_TARGET      default: example.com
 *   E2E_WEB_ENRICH_TIMEOUT_MS  default: 600000 (10 min)
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
const target = process.env['E2E_WEB_ENRICH_TARGET'] ?? 'example.com';
const templateName = 'web-enrich';
const templateTimeoutMs = Number(process.env['E2E_WEB_ENRICH_TIMEOUT_MS'] ?? 600_000);

// Double opt-in gate: the three base creds + WEB_ENRICH_E2E=1.
const webEnrichEnabled = ['1', 'true'].includes(process.env['WEB_ENRICH_E2E'] ?? '');
const describeWebEnrich = webEnrichEnabled ? describeOrSkipE2E(env) : describe.skip;

// ── assets + technologies helper (inline GQL — no frontend doc import) ────────

interface AssetTechRow {
  id: string;
  value: string;
  technologies: { name: string }[];
}

async function queryAssetTechnologies(
  gql: GraphQLClient,
  engagementId: string,
): Promise<AssetTechRow[]> {
  const res = await gql.request<{ assets: AssetTechRow[] }>(
    /* GraphQL */ `
      query WebEnrichAssets($engagementId: ID!) {
        assets(engagementId: $engagementId) {
          id
          value
          technologies {
            name
          }
        }
      }
    `,
    { engagementId },
  );
  return res.assets;
}

function technologyNames(assets: AssetTechRow[]): string[] {
  return assets.flatMap((a) => a.technologies.map((t) => t.name));
}

// ── suite ────────────────────────────────────────────────────────────────────

describeWebEnrich('Phase 8.2 — web-enrich end-to-end', () => {
  let gql: GraphQLClient;
  let engagementId: string;

  beforeAll(async () => {
    const auth = await restLogin(env.apiUrl!, env.email!, env.password!);
    gql = authedGqlClient(env.apiUrl!, auth.accessToken);
    const { engagementId: id } = await createEngagementWithWildcardScope(gql, {
      namePrefix: 'web-enrich',
      clientName: 'web-enrich',
      target,
    });
    engagementId = id;
  }, 60_000);

  it(
    'runs web-enrich, persists >=1 favicon-hash Technology, and soft-asserts WAF/CDN/JS scanners',
    async () => {
      // ---- Step 1: run the template ----------------------------------------
      const run = await runTemplate(gql, { engagementId, templateName, target });
      expect(run.id).toBeTruthy();

      // ---- Step 2: poll until terminal -------------------------------------
      const terminal = await pollTemplateRun(gql, run.id, templateTimeoutMs);
      expect(terminal.status).toBe('COMPLETED');

      // ---- Step 3: hard assertion — favicon needs no API key, so a
      //              favicon-hash Technology is the most reliable signal. -----
      const assets = await queryAssetTechnologies(gql, engagementId);
      const techNames = technologyNames(assets);
      const faviconTechs = techNames.filter((n) => n.startsWith('favicon-hash:'));
      expect(faviconTechs.length).toBeGreaterThanOrEqual(1);

      // ---- Step 4: soft signals (log only — depend on the live host) -------
      const wafTechs = techNames.filter((n) => n.startsWith('WAF:'));
      const cdnTechs = techNames.filter((n) => n.startsWith('CDN:') || n.startsWith('cloud:'));
      console.info(
        `[web-enrich] wafw00f: ${wafTechs.length} WAF technologies (soft — zero acceptable)`,
      );
      console.info(
        `[web-enrich] cdncheck: ${cdnTechs.length} CDN/cloud technologies (soft — zero acceptable)`,
      );

      // js-recon: endpoints + secret findings
      const endpointsRes = await gql.request<{ endpoints: Array<{ id: string; url: string }> }>(
        /* GraphQL */ `
          query WebEnrichEndpoints($engagementId: ID!) {
            endpoints(engagementId: $engagementId) {
              id
              url
            }
          }
        `,
        { engagementId },
      );
      const findingsRes = await gql.request<{
        findings: Array<{ id: string; title: string; severity: string }>;
      }>(
        /* GraphQL */ `
          query WebEnrichFindings($engagementId: ID!) {
            findings(engagementId: $engagementId) {
              id
              title
              severity
            }
          }
        `,
        { engagementId },
      );
      const jsSecretFindings = findingsRes.findings.filter((f) =>
        f.title.toLowerCase().includes('secret in js'),
      );
      console.info(
        `[web-enrich] js-recon: ${endpointsRes.endpoints.length} endpoints, ` +
          `${jsSecretFindings.length} JS-secret findings (soft — may be 0)`,
      );

      // ---- Step 5: log summary --------------------------------------------
      console.info(
        `[web-enrich] summary — technologies total=${techNames.length} ` +
          `favicon-hash=${faviconTechs.length} WAF=${wafTechs.length} CDN/cloud=${cdnTechs.length}`,
      );
    },
    templateTimeoutMs + 60_000,
  );
});
