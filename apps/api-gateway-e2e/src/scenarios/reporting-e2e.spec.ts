/**
 * Phase 4 acceptance: report generation end-to-end.
 *
 * Scenario:
 *  1. Login + create a fresh engagement (no scope rule needed — JSON
 *     export does not run any scan, it just serialises the empty
 *     engagement state).
 *  2. `generateReport({ engagementId, templateSlug: 'json-full-export' })`
 *     → poll `reports(engagementId)` until the row transitions to READY.
 *  3. Fetch `GET /reports/:id/download` with the bearer token, parse the
 *     JSON body, and assert the exported engagement.id matches.
 *
 * We pick `json-full-export` rather than `executive-summary-pdf` so the
 * test does not require Chromium in the worker image — boot time stays
 * predictable and the assertion can be a strict JSON equality instead of
 * a brittle PDF byte-count check.
 *
 * Opt-in: skips unless E2E_API_URL + E2E_EMAIL + E2E_PASSWORD are set
 * AND `REPORTING_E2E=1`. The extra gate prevents the suite from running
 * by accident on shared CI where the reports queue/worker may not be up.
 *
 * Required env:
 *   E2E_API_URL              e.g. http://localhost:4000
 *   E2E_EMAIL                existing operator email
 *   E2E_PASSWORD             existing operator password
 *   REPORTING_E2E=1          explicit opt-in
 * Optional:
 *   E2E_REPORTING_TIMEOUT_MS default: 120000 (2 min)
 *   E2E_REPORTING_POLL_MS   default: 2000
 */

import type { GraphQLClient } from 'graphql-request';
import {
  authedGqlClient,
  createEngagement,
  describeOrSkipE2E,
  readBaseEnv,
  restLogin,
  sleep,
} from '../helpers';

const env = readBaseEnv();
const reportingEnabled = process.env['REPORTING_E2E'] === '1';
const timeoutMs = Number(process.env['E2E_REPORTING_TIMEOUT_MS'] ?? 120_000);
const pollMs = Number(process.env['E2E_REPORTING_POLL_MS'] ?? 2000);

const describeOrSkip = reportingEnabled ? describeOrSkipE2E(env) : describe.skip;

interface ReportRow {
  id: string;
  status: 'PENDING' | 'GENERATING' | 'READY' | 'FAILED';
  format: string;
  errorMessage: string | null;
  template: { slug: string };
}

const GENERATE_REPORT_MUTATION = /* GraphQL */ `
  mutation GenerateReport($input: GenerateReportInput!) {
    generateReport(input: $input) {
      id
      status
      format
      template {
        slug
      }
    }
  }
`;

const REPORTS_QUERY = /* GraphQL */ `
  query Reports($engagementId: ID!) {
    reports(engagementId: $engagementId) {
      id
      status
      format
      errorMessage
      template {
        slug
      }
    }
  }
`;

async function pollReportReady(
  gql: GraphQLClient,
  engagementId: string,
  reportId: string,
): Promise<ReportRow> {
  const deadline = Date.now() + timeoutMs;
  let last: ReportRow | null = null;
  while (Date.now() < deadline) {
    const { reports } = await gql.request<{ reports: ReportRow[] }>(REPORTS_QUERY, {
      engagementId,
    });
    const row = reports.find((r) => r.id === reportId);
    if (row) {
      last = row;
      if (row.status === 'READY') return row;
      if (row.status === 'FAILED') {
        throw new Error(`report ${reportId} FAILED: ${row.errorMessage ?? '(no message)'}`);
      }
    }
    await sleep(pollMs);
  }
  throw new Error(
    `report ${reportId} did not reach READY within ${timeoutMs}ms (last=${last?.status ?? 'unknown'})`,
  );
}

describeOrSkip('Phase 4 — reporting end-to-end (JSON export)', () => {
  let gql: GraphQLClient;
  let accessToken: string;

  beforeAll(async () => {
    const auth = await restLogin(env.apiUrl!, env.email!, env.password!);
    accessToken = auth.accessToken;
    gql = authedGqlClient(env.apiUrl!, accessToken);
  }, 30_000);

  it(
    'generates a JSON report and serves it via the REST download endpoint',
    async () => {
      const engagement = await createEngagement(gql, {
        name: `e2e-report-${Date.now()}`,
        clientName: 'e2e-client',
      });
      expect(engagement.id).toBeTruthy();

      const generated = await gql.request<{
        generateReport: { id: string; status: string; format: string; template: { slug: string } };
      }>(GENERATE_REPORT_MUTATION, {
        input: { engagementId: engagement.id, templateSlug: 'json-full-export' },
      });
      expect(generated.generateReport.id).toBeTruthy();
      expect(generated.generateReport.template.slug).toBe('json-full-export');
      expect(['PENDING', 'GENERATING', 'READY']).toContain(generated.generateReport.status);

      const ready = await pollReportReady(gql, engagement.id, generated.generateReport.id);
      expect(ready.status).toBe('READY');
      expect(ready.format).toBe('JSON');

      const dl = await fetch(`${env.apiUrl!}/reports/${ready.id}/download`, {
        method: 'GET',
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(dl.ok).toBe(true);
      expect(dl.headers.get('content-type') ?? '').toMatch(/application\/json/i);

      const body = (await dl.json()) as { engagement?: { id?: string } };
      expect(body.engagement?.id).toBe(engagement.id);
    },
    timeoutMs + 60_000,
  );
});
