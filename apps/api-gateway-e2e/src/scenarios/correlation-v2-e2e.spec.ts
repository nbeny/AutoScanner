/**
 * Phase 7 acceptance: correlation-v2 end-to-end (opt-in).
 *
 * Validates the cross-scanner correlated-findings surface introduced in
 * Phase 7: the `correlatedFindings(engagementId)` query, per-finding triage
 * via `setFindingStatus(id, status)`, and the overall GraphQL wiring.
 *
 * This suite is **double opt-in**:
 *   1. Base credentials must be set (E2E_API_URL + E2E_EMAIL + E2E_PASSWORD).
 *   2. `E2E_RUN_CORRELATION=1` must be set explicitly.
 * Without both, the entire describe block is skipped — so CI stays green
 * even when only the base stack is available and no multi-scanner findings
 * have been produced yet.
 *
 * Assumptions when running:
 *   - The full stack is up: api-gateway, scan-worker, parser-worker,
 *     orchestrator-worker, correlation-worker.
 *   - An engagement with pre-existing findings is supplied via
 *     E2E_CORR_ENGAGEMENT_ID OR the spec creates a fresh engagement and
 *     skips cluster assertions (fresh engagements have no findings).
 *   - Set E2E_CORRELATION_EXPECT_CLUSTER=1 to additionally assert ≥1
 *     CorrelatedFinding with sourceCount ≥ 2 and perform a triage round-trip.
 *     This requires an engagement that has had multi-scanner scans run against
 *     it (manual setup or a preceding template run).
 *
 * Required env:
 *   E2E_API_URL                  e.g. http://localhost:4000
 *   E2E_EMAIL                    existing operator email
 *   E2E_PASSWORD                 existing operator password
 *   E2E_RUN_CORRELATION=1        explicit opt-in
 * Optional:
 *   E2E_CORR_ENGAGEMENT_ID       use a pre-populated engagement; otherwise a
 *                                fresh empty engagement is created.
 *   E2E_CORRELATION_EXPECT_CLUSTER=1   assert ≥1 cluster with sourceCount ≥ 2
 *                                      + triage round-trip.
 */

import type { GraphQLClient } from 'graphql-request';
import {
  authedGqlClient,
  correlatedFindingsByEngagement,
  createEngagement,
  describeOrSkipE2E,
  readBaseEnv,
  restLogin,
  setFindingStatus,
} from '../helpers';

const env = readBaseEnv();

// Double opt-in: base creds must exist AND the explicit flag must be set.
const enabled = ['1', 'true'].includes(process.env['E2E_RUN_CORRELATION'] ?? '');
const describeCorr = enabled ? describeOrSkipE2E(env) : describe.skip;

const expectCluster = ['1', 'true'].includes(process.env['E2E_CORRELATION_EXPECT_CLUSTER'] ?? '');

// If a pre-populated engagement id is supplied use it; otherwise we create
// one. A fresh engagement legitimately returns an empty correlatedFindings
// array — that is still a valid proof that the resolver is wired.
const preloadedEngagementId = process.env['E2E_CORR_ENGAGEMENT_ID'];

describeCorr('Phase 7 — correlation-v2 end-to-end', () => {
  let gql: GraphQLClient;
  let engagementId: string;

  beforeAll(async () => {
    const auth = await restLogin(env.apiUrl!, env.email!, env.password!);
    gql = authedGqlClient(env.apiUrl!, auth.accessToken);

    if (preloadedEngagementId) {
      engagementId = preloadedEngagementId;
    } else {
      const engagement = await createEngagement(gql, {
        name: `e2e-corr-v2-${Date.now()}`,
        clientName: 'e2e-client',
      });
      engagementId = engagement.id;
    }
  }, 30_000);

  it('correlatedFindings query resolves and returns an array for an owned engagement', async () => {
    const findings = await correlatedFindingsByEngagement(gql, engagementId);

    // The resolver must return an array — may be empty on a fresh engagement.
    expect(Array.isArray(findings)).toBe(true);

    if (findings.length > 0) {
      // Spot-check the shape of the first finding.
      const first = findings[0];
      expect(typeof first.id).toBe('string');
      expect(first.id.length).toBeGreaterThan(0);
      expect(typeof first.title).toBe('string');
      expect(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(first.severity);
      expect(['OPEN', 'TRIAGED', 'CONFIRMED', 'FALSE_POSITIVE', 'RESOLVED']).toContain(
        first.status,
      );
      expect(typeof first.sourceCount).toBe('number');
      expect(first.sourceCount).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(first.sources)).toBe(true);
      expect(first.sources.length).toBeGreaterThanOrEqual(1);
    } else {
      // Log so a future operator knows why no cluster assertions ran.
      // eslint-disable-next-line no-console
      console.info(
        '[correlation-v2-e2e] engagement has 0 correlated findings — ' +
          'resolver is wired but no cluster assertions will run. ' +
          'To exercise cluster assertions, set E2E_CORR_ENGAGEMENT_ID to an ' +
          'engagement with multi-scanner findings and E2E_CORRELATION_EXPECT_CLUSTER=1.',
      );
    }
  });

  it('an unauthenticated request is rejected by the GraphQL guard', async () => {
    // Build a client with a bogus token — the guard must reject it.
    const unauthGql = authedGqlClient(env.apiUrl!, 'invalid-token');
    await expect(correlatedFindingsByEngagement(unauthGql, engagementId)).rejects.toThrow();
  });

  // Cluster + triage assertions are only attempted when explicitly requested
  // via E2E_CORRELATION_EXPECT_CLUSTER=1. Without it the `it` block is a
  // no-op skip so the report stays clean even on a fresh engagement.
  (expectCluster ? it : it.skip)(
    'cluster with sourceCount >= 2 exists and triage round-trip works',
    async () => {
      const findings = await correlatedFindingsByEngagement(gql, engagementId);

      // Filter to multi-source clusters.
      const clusters = findings.filter((f) => f.sourceCount >= 2);
      expect(clusters.length).toBeGreaterThanOrEqual(1);

      const firstCluster = clusters[0];
      expect(firstCluster.sources.length).toBeGreaterThanOrEqual(2);

      // Triage round-trip: mark FALSE_POSITIVE, assert it sticks.
      const triaged = await setFindingStatus(gql, firstCluster.id, 'FALSE_POSITIVE');
      expect(triaged.id).toBe(firstCluster.id);
      expect(triaged.status).toBe('FALSE_POSITIVE');

      // Restore to OPEN so subsequent runs start clean.
      const restored = await setFindingStatus(gql, firstCluster.id, 'OPEN');
      expect(restored.status).toBe('OPEN');
    },
  );
});
