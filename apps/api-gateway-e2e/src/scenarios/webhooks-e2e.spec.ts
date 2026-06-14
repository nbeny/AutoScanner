/**
 * Phase 5.5 acceptance: generic webhook ingest → finding visible in GraphQL.
 *
 * Scenario:
 *  1. Operator login → authedGqlClient.
 *  2. createEngagement → capture engagementId.
 *  3. POST ${apiUrl}/webhooks/generic with x-autoscanner-token header and
 *     a single XSS finding → expect HTTP 202 + { accepted: true, webhookEventId }.
 *  4. Poll GraphQL `findings(engagementId)` (1 s interval, 30 s timeout)
 *     until a finding with title 'XSS' is present → assert severity HIGH.
 *
 * Opt-in: skips unless E2E_API_URL + E2E_EMAIL + E2E_PASSWORD are set
 * AND `WEBHOOK_E2E=1`.
 *
 * Required env:
 *   E2E_API_URL               e.g. http://localhost:4000
 *   E2E_EMAIL                 existing operator email
 *   E2E_PASSWORD              existing operator password
 *   WEBHOOK_E2E=1             explicit opt-in
 *   E2E_WEBHOOK_GENERIC_TOKEN shared-secret token for the generic source
 *                             (must match WEBHOOK_GENERIC_TOKEN in the server env)
 */

import type { GraphQLClient } from 'graphql-request';
import {
  authedGqlClient,
  createEngagement,
  describeOrSkipE2E,
  readBaseEnv,
  restLogin,
} from '../helpers';
import type { Finding } from '../helpers';

const env = readBaseEnv();
const webhookEnabled = process.env['WEBHOOK_E2E'] === '1';
const describeOrSkip = webhookEnabled ? describeOrSkipE2E(env) : describe.skip;

const FINDINGS_QUERY = /* GraphQL */ `
  query Findings($engagementId: ID!) {
    findings(engagementId: $engagementId) {
      id
      title
      severity
    }
  }
`;

/** Poll findings until a finding with the given title appears or timeout. */
async function pollForFinding(
  gql: GraphQLClient,
  engagementId: string,
  title: string,
  timeoutMs: number,
): Promise<Finding> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { findings } = await gql.request<{ findings: Finding[] }>(FINDINGS_QUERY, {
      engagementId,
    });
    const match = findings.find((f) => f.title === title);
    if (match) return match;
    await new Promise<void>((r) => setTimeout(r, 1000));
  }
  throw new Error(
    `Finding with title '${title}' did not appear in engagement ${engagementId} within ${timeoutMs}ms`,
  );
}

describeOrSkip('Phase 5.5 — webhook ingest e2e', () => {
  let gql: GraphQLClient;

  beforeAll(async () => {
    const auth = await restLogin(env.apiUrl!, env.email!, env.password!);
    gql = authedGqlClient(env.apiUrl!, auth.accessToken);
  });

  it('POSTs a generic webhook finding and polls until it appears in GraphQL', async () => {
    // Step 2: create a fresh engagement
    const engagement = await createEngagement(gql, {
      name: `webhook-e2e-${Date.now()}`,
      clientName: 'webhook-e2e',
    });
    const engagementId = engagement.id;

    // Step 3: POST to /webhooks/generic
    const token = process.env['E2E_WEBHOOK_GENERIC_TOKEN'] ?? '';
    const apiUrl = env.apiUrl!;

    const res = await fetch(`${apiUrl}/webhooks/generic`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-autoscanner-token': token,
      },
      body: JSON.stringify({
        engagementId,
        findings: [
          {
            title: 'XSS',
            severity: 'HIGH',
            assetValue: 'app.example.com',
            location: 'https://app.example.com/x',
          },
        ],
      }),
    });

    expect(res.status).toBe(202);
    const body = (await res.json()) as { accepted: boolean; webhookEventId: string };
    expect(body.accepted).toBe(true);
    expect(typeof body.webhookEventId).toBe('string');

    // Step 4: poll until the XSS finding is visible in GraphQL (30 s timeout)
    const finding = await pollForFinding(gql, engagementId, 'XSS', 30_000);
    expect(finding.title).toBe('XSS');
    expect(finding.severity).toBe('HIGH');
  }, 40_000); // jest timeout: 40 s (extra headroom beyond the 30 s poll)
});
