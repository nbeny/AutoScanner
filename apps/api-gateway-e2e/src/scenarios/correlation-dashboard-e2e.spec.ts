/**
 * Phase 3 acceptance (Étape 3): correlation dashboard end-to-end.
 *
 * Scenario:
 *  1. Login + create a fresh engagement with a wildcard scope rule.
 *  2. runTemplate({ templateName: 'web-deep', target }) → poll
 *     `templateRun(id)` until COMPLETED. We pick `web-deep` because it
 *     runs the full chain (subfinder → dnsx → httpx → naabu → nuclei)
 *     so a single subdomain accumulates provenance from multiple
 *     scanners — which is the whole point of the correlation surface.
 *  3. Pick any persisted SUBDOMAIN asset, query `assetDetail(id)` with
 *     `observations { scannerName, kind }`, and assert:
 *        - The asset carries ≥ 3 observation rows (parser writes one
 *          per scanner that touched it: subfinder discovers it, dnsx
 *          resolves it, httpx fingerprints it — minimum 3 distinct
 *          scanner contributions).
 *        - The set of distinct `scannerName` values has size ≥ 2 (we
 *          want true cross-tool provenance, not 3 rows from one tool).
 *  4. Wire check for the CVE enrichment surface: if any finding from
 *     `web-deep` carries a `cveId`, query `cveInfo(cveId)` and assert
 *     the resolver returns a row with `fetchStatus` in the documented
 *     enum (OK / NOT_FOUND / RATE_LIMITED / ERROR / PENDING). This
 *     confirms the parser-worker enqueued CVE_ENRICHMENT and the
 *     cveInfo resolver is wired — without depending on real-NVD
 *     latency or rate limits to land an OK row inside the test window.
 *
 *     If web-deep produced zero findings with cveId (e.g. a
 *     well-hardened target like hackerone.com), the CVE assertion is
 *     skipped with an `info` log and the test still passes on the
 *     provenance assertion alone.
 *
 * Opt-in: skips unless E2E_API_URL + E2E_EMAIL + E2E_PASSWORD are set.
 * Assumes the full stack is running (api-gateway + scan-worker +
 * parser-worker + orchestrator-worker + cve-enricher-worker + Docker
 * daemon with subfinder / dnsx / httpx / naabu / nuclei images pulled).
 *
 * Required env:
 *   E2E_API_URL                                e.g. http://localhost:4000
 *   E2E_EMAIL                                  existing operator email
 *   E2E_PASSWORD                               existing operator password
 * Optional:
 *   E2E_CORRELATION_TARGET                     default: hackerone.com
 *   E2E_CORRELATION_TIMEOUT_MS                 default: 600000 (10 min)
 *   E2E_CORRELATION_PROVENANCE_MIN             default: 3
 *   E2E_CORRELATION_SCANNERS_MIN               default: 2
 */

import type { GraphQLClient } from 'graphql-request';
import {
  authedGqlClient,
  createEngagementWithWildcardScope,
  describeOrSkipE2E,
  filterAssetsByType,
  pollTemplateRun,
  queryAssetDetailWithObservations,
  queryAssetsFull,
  queryCveInfo,
  queryFindings,
  readBaseEnv,
  restLogin,
  runTemplate,
} from '../helpers';

const env = readBaseEnv();
const target = process.env['E2E_CORRELATION_TARGET'] ?? 'hackerone.com';
const templateName = 'web-deep';
const templateTimeoutMs = Number(process.env['E2E_CORRELATION_TIMEOUT_MS'] ?? 600_000);
const provenanceMin = Number(process.env['E2E_CORRELATION_PROVENANCE_MIN'] ?? 3);
const scannersMin = Number(process.env['E2E_CORRELATION_SCANNERS_MIN'] ?? 2);

const VALID_FETCH_STATUSES = new Set(['OK', 'NOT_FOUND', 'RATE_LIMITED', 'ERROR', 'PENDING']);

describeOrSkipE2E(env)('Phase 3 Étape 3 — correlation dashboard end-to-end', () => {
  let gql: GraphQLClient;
  let engagementId: string;

  beforeAll(async () => {
    const auth = await restLogin(env.apiUrl!, env.email!, env.password!);
    gql = authedGqlClient(env.apiUrl!, auth.accessToken);
    const { engagementId: id } = await createEngagementWithWildcardScope(gql, {
      namePrefix: 'e2e-correlation',
      clientName: 'e2e-client',
      target,
    });
    engagementId = id;
  }, 90_000);

  it(
    'persists cross-scanner provenance on subdomain assets and wires cveInfo lookup for findings with a cveId',
    async () => {
      // ---- Run the full chain ----------------------------------------
      const run = await runTemplate(gql, { engagementId, templateName, target });
      expect(run.id).toBeTruthy();

      const terminal = await pollTemplateRun(gql, run.id, templateTimeoutMs);
      expect(terminal.status).toBe('COMPLETED');

      const assets = await queryAssetsFull(gql, engagementId);
      const subdomains = filterAssetsByType(assets, 'SUBDOMAIN');
      expect(subdomains.length).toBeGreaterThanOrEqual(1);

      // ---- Provenance: find one subdomain with cross-scanner coverage
      // We scan all subdomains rather than asserting on the first one
      // because subfinder's discovery set is non-deterministic — picking
      // the first row in a list can land on a subdomain that dnsx/httpx
      // never reached. We need at least ONE subdomain with the expected
      // breadth of coverage; that proves the parser wiring works.
      let bestDetail: Awaited<ReturnType<typeof queryAssetDetailWithObservations>> | null = null;
      let bestScanners = 0;
      for (const sd of subdomains) {
        const detail = await queryAssetDetailWithObservations(gql, sd.id);
        const distinctScanners = new Set(detail.observations.map((o) => o.scannerName));
        if (
          detail.observations.length >= provenanceMin &&
          distinctScanners.size >= scannersMin &&
          distinctScanners.size > bestScanners
        ) {
          bestDetail = detail;
          bestScanners = distinctScanners.size;
        }
      }

      expect(bestDetail).not.toBeNull();
      // Re-assert on the chosen detail so failure messages name the row.
      const chosen = bestDetail!;
      expect(chosen.observations.length).toBeGreaterThanOrEqual(provenanceMin);
      const distinctScannersFinal = new Set(chosen.observations.map((o) => o.scannerName));
      expect(distinctScannersFinal.size).toBeGreaterThanOrEqual(scannersMin);

      // ---- CVE enrichment wire check ---------------------------------
      const findings = await queryFindings(gql, engagementId);
      const findingsWithCve = findings.filter(
        (f): f is typeof f & { cveId: string } => typeof f.cveId === 'string' && f.cveId.length > 0,
      );

      if (findingsWithCve.length === 0) {
        // Hardened targets legitimately produce zero CVE findings — the
        // provenance assertion above is enough to call the suite green.
        // eslint-disable-next-line no-console
        console.info(
          '[correlation-dashboard-e2e] web-deep produced 0 findings with cveId — skipping CVE wire assertion',
        );
        return;
      }

      const sampled = findingsWithCve[0];
      const info = await queryCveInfo(gql, sampled.cveId);
      expect(info.cveId).toBe(sampled.cveId);
      expect(VALID_FETCH_STATUSES.has(info.fetchStatus)).toBe(true);
    },
    // outer Jest timeout: template timeout + 5min overhead (per-subdomain
    // assetDetail loop can be chatty on engagements with 50+ subdomains).
    templateTimeoutMs + 300_000,
  );
});
