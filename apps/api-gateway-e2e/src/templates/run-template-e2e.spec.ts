/**
 * Phase 2 acceptance (API surface only): login → ensure engagement with
 * INCLUDE WILDCARD_DOMAIN scope rule → runTemplate(target=hackerone.com)
 * returns a PENDING TemplateRun → templateRun(id) round-trips →
 * runTemplate with an out-of-scope target is rejected with FORBIDDEN.
 *
 * This suite only verifies the GraphQL surface; it does NOT require
 * orchestrator/parser workers to be running. End-to-end completion of
 * a template run is covered separately (Task 13).
 *
 * The current GraphQL surface does not yet expose a mutation to create
 * scope rules. The e2e therefore expects the operator account to have
 * one engagement pre-seeded with an `INCLUDE WILDCARD_DOMAIN` rule whose
 * value is `hackerone.com` (or whatever E2E_TEMPLATE_TARGET resolves to).
 * If not present, the test will skip the scope-positive case.
 *
 * Required env:
 *   E2E_API_URL        e.g. http://localhost:3000
 *   E2E_EMAIL          existing operator email
 *   E2E_PASSWORD       existing operator password
 * Optional:
 *   E2E_TEMPLATE_NAME       default: recon-passive
 *   E2E_TEMPLATE_TARGET     default: hackerone.com
 *   E2E_OUT_OF_SCOPE_TARGET default: example.org
 *   E2E_ENGAGEMENT_ID       pre-seeded engagement id; required for full coverage
 */

import type { GraphQLClient } from 'graphql-request';
import { authedGqlClient, describeOrSkipE2E, readBaseEnv, restLogin } from '../helpers';
import type { GqlError, TemplateRun } from '../helpers';

const env = readBaseEnv();
const templateName = process.env['E2E_TEMPLATE_NAME'] ?? 'recon-passive';
const target = process.env['E2E_TEMPLATE_TARGET'] ?? 'hackerone.com';
const outOfScopeTarget = process.env['E2E_OUT_OF_SCOPE_TARGET'] ?? 'example.org';
const seededEngagementId = process.env['E2E_ENGAGEMENT_ID'];

describeOrSkipE2E(env)('Phase 2 — runTemplate GraphQL surface', () => {
  let gql: GraphQLClient;

  beforeAll(async () => {
    const auth = await restLogin(env.apiUrl!, env.email!, env.password!);
    gql = authedGqlClient(env.apiUrl!, auth.accessToken);
  }, 30_000);

  const inScopeCase = seededEngagementId ? it : it.skip;

  inScopeCase(
    'runTemplate returns a PENDING TemplateRun for an in-scope target and round-trips via templateRun(id)',
    async () => {
      const run = await gql.request<{ runTemplate: TemplateRun }>(
        /* GraphQL */ `
          mutation Run($input: RunTemplateInput!) {
            runTemplate(input: $input) {
              id
              templateName
              target
              status
              currentStepIndex
              scans {
                id
              }
            }
          }
        `,
        { input: { engagementId: seededEngagementId, templateName, target } },
      );

      expect(run.runTemplate.id).toBeTruthy();
      expect(run.runTemplate.status).toBe('PENDING');
      expect(run.runTemplate.currentStepIndex).toBe(0);
      expect(run.runTemplate.target).toBe(target);
      expect(run.runTemplate.templateName).toBe(templateName);
      expect(Array.isArray(run.runTemplate.scans)).toBe(true);

      const fetched = await gql.request<{ templateRun: TemplateRun | null }>(
        /* GraphQL */ `
          query R($id: ID!) {
            templateRun(id: $id) {
              id
              status
              currentStepIndex
              scans {
                id
              }
            }
          }
        `,
        { id: run.runTemplate.id },
      );

      expect(fetched.templateRun).not.toBeNull();
      expect(fetched.templateRun?.id).toBe(run.runTemplate.id);
    },
    30_000,
  );

  const outOfScopeCase = seededEngagementId ? it : it.skip;

  outOfScopeCase(
    'runTemplate rejects an out-of-scope target with FORBIDDEN',
    async () => {
      let caught: unknown;
      try {
        await gql.request<{ runTemplate: TemplateRun }>(
          /* GraphQL */ `
            mutation Run($input: RunTemplateInput!) {
              runTemplate(input: $input) {
                id
              }
            }
          `,
          {
            input: {
              engagementId: seededEngagementId,
              templateName,
              target: outOfScopeTarget,
            },
          },
        );
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeDefined();
      const errors = (caught as GqlError).response?.errors ?? [];
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.extensions?.code).toBe('FORBIDDEN');
    },
    30_000,
  );

  it('scanTemplates query returns the seeded templates', async () => {
    const res = await gql.request<{
      scanTemplates: { id: string; name: string; displayName: string }[];
    }>(/* GraphQL */ `
      query Templates {
        scanTemplates {
          id
          name
          displayName
        }
      }
    `);
    expect(Array.isArray(res.scanTemplates)).toBe(true);
    expect(res.scanTemplates.length).toBeGreaterThan(0);
  });
});
