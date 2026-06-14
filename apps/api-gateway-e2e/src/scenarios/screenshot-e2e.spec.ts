/**
 * Phase 8.2b acceptance: gowitness screenshot end-to-end.
 *
 * Triple opt-in: skips unless the three base creds are set AND
 * SCREENSHOT_E2E=1. Keeps the gowitness scanner (which needs Docker +
 * Chromium + the autoscanner/gowitness image) out of the shared CI job;
 * run it in a dedicated job with the full stack available:
 *   autoscanner/gowitness:1.0   (built via `pnpm scanners:build`)
 *
 * Required env:
 *   E2E_API_URL       e.g. http://localhost:4000
 *   E2E_EMAIL         existing operator email
 *   E2E_PASSWORD      existing operator password
 *   SCREENSHOT_E2E    must be "1" or "true" to opt-in
 *
 * Optional env:
 *   E2E_SCREENSHOT_TARGET      default: example.com
 *   E2E_SCREENSHOT_TIMEOUT_MS  default: 600000 (10 min)
 *
 * What this suite asserts:
 *   1. Login succeeds and returns a valid access token.
 *   2. An engagement with a wildcard scope is created.
 *   3. The web-enrich template (which includes the gowitness step) runs to
 *      COMPLETED status.
 *   4. A scan job with scannerName === 'gowitness' is found and has
 *      status === 'COMPLETED'.
 *   5. The raw-output presigned URL for that job (`GET /scan-jobs/:id/raw`)
 *      returns a response with content-type starting with 'image/png' and a
 *      non-zero body length, confirming that a real PNG screenshot was
 *      captured and stored in S3/object storage.
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
const target = process.env['E2E_SCREENSHOT_TARGET'] ?? 'example.com';
const templateName = 'web-enrich';
const timeoutMs = Number(process.env['E2E_SCREENSHOT_TIMEOUT_MS'] ?? 600_000);

// Double opt-in gate: the three base creds + SCREENSHOT_E2E=1.
const screenshotEnabled = ['1', 'true'].includes(process.env['SCREENSHOT_E2E'] ?? '');
const describeScreenshot = screenshotEnabled ? describeOrSkipE2E(env) : describe.skip;

// ── helpers ──────────────────────────────────────────────────────────────────

interface ScanJob {
  id: string;
  scannerName: string;
  status: string;
  rawOutputKey?: string | null;
}

interface ScanWithJobs {
  id: string;
  status: string;
  jobs: ScanJob[];
}

interface TemplateRunWithScans {
  id: string;
  status: string;
  scans: ScanWithJobs[];
}

/** Query a template run's nested scans and their jobs (including rawOutputKey). */
async function queryTemplateRunWithScans(
  gql: GraphQLClient,
  id: string,
): Promise<TemplateRunWithScans> {
  const res = await gql.request<{ templateRun: TemplateRunWithScans }>(
    /* GraphQL */ `
      query ScreenshotTemplateRun($id: ID!) {
        templateRun(id: $id) {
          id
          status
          scans {
            id
            status
            jobs {
              id
              scannerName
              status
              rawOutputKey
            }
          }
        }
      }
    `,
    { id },
  );
  return res.templateRun;
}

/**
 * Fetch the raw output for a scan job via the REST endpoint
 * `GET /scan-jobs/:id/raw`. The endpoint issues a 302 redirect to a presigned
 * object-storage URL; we follow it and return the Response so the caller can
 * inspect content-type and body length.
 *
 * The bearer token is required — the endpoint is behind JwtAuthGuard.
 */
async function fetchScanJobRaw(
  apiUrl: string,
  accessToken: string,
  jobId: string,
): Promise<Response> {
  return fetch(`${apiUrl}/scan-jobs/${jobId}/raw`, {
    headers: { authorization: `Bearer ${accessToken}` },
    redirect: 'follow',
  });
}

// ── suite ────────────────────────────────────────────────────────────────────

describeScreenshot('Phase 8.2b — gowitness screenshot end-to-end', () => {
  let gql: GraphQLClient;
  let accessToken: string;
  let engagementId: string;

  beforeAll(async () => {
    const auth = await restLogin(env.apiUrl!, env.email!, env.password!);
    accessToken = auth.accessToken;
    gql = authedGqlClient(env.apiUrl!, accessToken);

    const { engagementId: id } = await createEngagementWithWildcardScope(gql, {
      namePrefix: 'screenshot',
      clientName: 'screenshot',
      target,
    });
    engagementId = id;
  }, 60_000);

  it(
    'runs web-enrich (gowitness step), completes, and stores a valid PNG screenshot',
    async () => {
      // ---- Step 1: run the web-enrich template (includes gowitness) --------
      const run = await runTemplate(gql, { engagementId, templateName, target });
      expect(run.id).toBeTruthy();

      // ---- Step 2: poll until terminal ------------------------------------
      const terminal = await pollTemplateRun(gql, run.id, timeoutMs);
      expect(terminal.status).toBe('COMPLETED');

      // ---- Step 3: fetch the template run with its scans + jobs -----------
      const runWithScans = await queryTemplateRunWithScans(gql, run.id);

      // Flatten all jobs across all scans that belong to this template run.
      const allJobs = runWithScans.scans.flatMap((s) => s.jobs);

      // ---- Step 4: find the completed gowitness job -----------------------
      const gowitnessJob = allJobs.find(
        (j) => j.scannerName === 'gowitness' && j.status === 'COMPLETED',
      );
      expect(gowitnessJob).toBeDefined();
      // Narrow the type — expect() above guarantees this is defined.
      const job = gowitnessJob!;

      // The job must have produced a raw output key (S3/MinIO object).
      expect(job.rawOutputKey).toBeTruthy();

      // ---- Step 5: fetch the raw output via REST presigned redirect -------
      // GET /scan-jobs/:id/raw → 302 → presigned URL → PNG bytes
      const rawRes = await fetchScanJobRaw(env.apiUrl!, accessToken, job.id);
      expect(rawRes.ok).toBe(true);

      const contentType = rawRes.headers.get('content-type') ?? '';
      expect(contentType).toMatch(/^image\/png/);

      const body = await rawRes.arrayBuffer();
      expect(body.byteLength).toBeGreaterThan(0);

      // Log a summary for CI visibility.
      console.info(
        `[screenshot] gowitness job=${job.id} rawOutputKey=${job.rawOutputKey} ` +
          `content-type=${contentType} bytes=${body.byteLength}`,
      );
    },
    timeoutMs + 60_000,
  );
});
