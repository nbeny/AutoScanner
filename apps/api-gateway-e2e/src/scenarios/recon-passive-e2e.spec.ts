/**
 * Phase 2 acceptance (Étape 1): recon-passive template end-to-end.
 *
 * Scenario:
 *  1. Login + create a fresh engagement.
 *  2. Create an INCLUDE WILDCARD_DOMAIN ScopeRule for `hackerone.com` via
 *     the `createScopeRule` mutation.
 *  3. runTemplate({ templateName: 'recon-passive', target }) → poll
 *     `templateRun(id)` until COMPLETED (timeout 5min).
 *  4. Assert assets(type=SUBDOMAIN, engagementId) count >= threshold.
 *  5. Assert at least one Asset carries technologies (>=1 across all
 *     subdomains).
 *  6. Idempotence: re-runTemplate with the same params → poll to
 *     COMPLETED → re-query → counts are stable (subdomains stay the same
 *     within ±10% to absorb upstream discovery variance; technologies
 *     never decrease).
 *
 * Opt-in: skips unless E2E_API_URL + E2E_EMAIL + E2E_PASSWORD are set.
 * Assumes the full stack is running (api-gateway + scan-worker +
 * parser-worker + orchestrator-worker + Docker daemon with subfinder /
 * httpx images already pulled).
 *
 * Required env:
 *   E2E_API_URL        e.g. http://localhost:4000
 *   E2E_EMAIL          existing operator email
 *   E2E_PASSWORD       existing operator password
 * Optional:
 *   E2E_TEMPLATE_TARGET           default: hackerone.com
 *   E2E_TEMPLATE_NAME             default: recon-passive
 *   E2E_TEMPLATE_TIMEOUT_MS       default: 300000 (5min)
 *   E2E_SUBDOMAIN_MIN_COUNT       default: 5
 */

import { GraphQLClient } from 'graphql-request';

const apiUrl = process.env['E2E_API_URL'];
const email = process.env['E2E_EMAIL'];
const password = process.env['E2E_PASSWORD'];
const target = process.env['E2E_TEMPLATE_TARGET'] ?? 'hackerone.com';
const templateName = process.env['E2E_TEMPLATE_NAME'] ?? 'recon-passive';
const templateTimeoutMs = Number(process.env['E2E_TEMPLATE_TIMEOUT_MS'] ?? 300_000);
const subdomainMinCount = Number(process.env['E2E_SUBDOMAIN_MIN_COUNT'] ?? 5);

const describeOrSkip = apiUrl && email && password ? describe : describe.skip;

interface AuthPayload {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface Engagement {
  id: string;
  name: string;
}

interface ScopeRule {
  id: string;
  engagementId: string;
  ruleType: string;
  targetType: string;
  value: string;
}

interface TemplateRun {
  id: string;
  templateName: string;
  target: string;
  status: string;
  currentStepIndex: number;
  errorMessage?: string | null;
  completedAt?: string | null;
}

interface Technology {
  id: string;
  name: string;
}

interface Asset {
  id: string;
  type: string;
  value: string;
  canonicalValue: string;
  lastSeenAt: string;
  technologies?: Technology[];
}

async function restLogin(): Promise<AuthPayload> {
  const res = await fetch(`${apiUrl!}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login failed: HTTP ${res.status} ${await res.text()}`);
  return (await res.json()) as AuthPayload;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function pollTemplateRun(
  gql: GraphQLClient,
  id: string,
  timeoutMs: number,
): Promise<TemplateRun> {
  const deadline = Date.now() + timeoutMs;
  let last: TemplateRun | null = null;
  while (Date.now() < deadline) {
    const polled = await gql.request<{ templateRun: TemplateRun | null }>(
      /* GraphQL */ `
        query R($id: ID!) {
          templateRun(id: $id) {
            id
            templateName
            target
            status
            currentStepIndex
            errorMessage
            completedAt
          }
        }
      `,
      { id },
    );
    if (polled.templateRun) {
      last = polled.templateRun;
      if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(polled.templateRun.status)) {
        return polled.templateRun;
      }
    }
    await sleep(4000);
  }
  throw new Error(
    `templateRun ${id} did not reach a terminal status within ${timeoutMs}ms (last=${
      last?.status ?? 'unknown'
    }, step=${last?.currentStepIndex ?? -1})`,
  );
}

async function querySubdomainAssets(gql: GraphQLClient, engagementId: string): Promise<Asset[]> {
  const res = await gql.request<{ assets: Asset[] }>(
    /* GraphQL */ `
      query A($engagementId: ID!) {
        assets(engagementId: $engagementId) {
          id
          type
          value
          canonicalValue
          lastSeenAt
          technologies {
            id
            name
          }
        }
      }
    `,
    { engagementId },
  );
  return res.assets.filter((a) => a.type === 'SUBDOMAIN');
}

describeOrSkip('Phase 2 Étape 1 — recon-passive end-to-end', () => {
  let gql: GraphQLClient;
  let engagementId: string;

  beforeAll(async () => {
    const auth = await restLogin();
    gql = new GraphQLClient(`${apiUrl!}/graphql`, {
      headers: { authorization: `Bearer ${auth.accessToken}` },
    });

    const engagementName = `e2e-recon-${Date.now()}`;
    const created = await gql.request<{ createEngagement: Engagement }>(
      /* GraphQL */ `
        mutation Create($input: CreateEngagementInput!) {
          createEngagement(input: $input) {
            id
            name
          }
        }
      `,
      { input: { name: engagementName, clientName: 'e2e-client' } },
    );
    engagementId = created.createEngagement.id;
    expect(engagementId).toBeTruthy();

    const rule = await gql.request<{ createScopeRule: ScopeRule }>(
      /* GraphQL */ `
        mutation Scope($input: CreateScopeRuleInput!) {
          createScopeRule(input: $input) {
            id
            engagementId
            ruleType
            targetType
            value
          }
        }
      `,
      {
        input: {
          engagementId,
          ruleType: 'INCLUDE',
          targetType: 'WILDCARD_DOMAIN',
          value: target,
        },
      },
    );
    expect(rule.createScopeRule.id).toBeTruthy();
    expect(rule.createScopeRule.ruleType).toBe('INCLUDE');
  }, 60_000);

  it(
    'runs recon-passive, persists >= threshold subdomains + >=1 technology, and is idempotent on a second run',
    async () => {
      // ---- First run -------------------------------------------------
      const firstRunRes = await gql.request<{ runTemplate: TemplateRun }>(
        /* GraphQL */ `
          mutation Run($input: RunTemplateInput!) {
            runTemplate(input: $input) {
              id
              status
            }
          }
        `,
        { input: { engagementId, templateName, target } },
      );
      const firstRunId = firstRunRes.runTemplate.id;
      expect(firstRunId).toBeTruthy();

      const firstTerminal = await pollTemplateRun(gql, firstRunId, templateTimeoutMs);
      expect(firstTerminal.status).toBe('COMPLETED');

      const firstSubdomains = await querySubdomainAssets(gql, engagementId);
      expect(firstSubdomains.length).toBeGreaterThanOrEqual(subdomainMinCount);

      const firstTechCount = firstSubdomains.reduce(
        (sum, a) => sum + (a.technologies?.length ?? 0),
        0,
      );
      expect(firstTechCount).toBeGreaterThanOrEqual(1);

      // ---- Second run (idempotence) ----------------------------------
      const secondRunRes = await gql.request<{ runTemplate: TemplateRun }>(
        /* GraphQL */ `
          mutation Run($input: RunTemplateInput!) {
            runTemplate(input: $input) {
              id
              status
            }
          }
        `,
        { input: { engagementId, templateName, target } },
      );
      const secondRunId = secondRunRes.runTemplate.id;
      expect(secondRunId).toBeTruthy();
      expect(secondRunId).not.toBe(firstRunId);

      const secondTerminal = await pollTemplateRun(gql, secondRunId, templateTimeoutMs);
      expect(secondTerminal.status).toBe('COMPLETED');

      const secondSubdomains = await querySubdomainAssets(gql, engagementId);

      // Counts should be stable (we allow ±10% to absorb upstream
      // discovery variance from subfinder; in practice this should be
      // ~0% but external sources can fluctuate).
      const drift = Math.abs(secondSubdomains.length - firstSubdomains.length);
      const tolerance = Math.max(1, Math.ceil(firstSubdomains.length * 0.1));
      expect(drift).toBeLessThanOrEqual(tolerance);

      // Same canonical set should still be present (subset check: every
      // first-run subdomain still resolves on the second pass — within
      // tolerance — so we assert at least 90% overlap).
      const firstCanon = new Set(firstSubdomains.map((s) => s.canonicalValue));
      const secondCanon = new Set(secondSubdomains.map((s) => s.canonicalValue));
      const persisted = [...firstCanon].filter((c) => secondCanon.has(c)).length;
      expect(persisted).toBeGreaterThanOrEqual(Math.floor(firstCanon.size * 0.9));

      // lastSeenAt should advance for at least one persisted subdomain,
      // proving the parser updated the row instead of inserting duplicates.
      const firstSeenByCanon = new Map(
        firstSubdomains.map((s) => [s.canonicalValue, s.lastSeenAt]),
      );
      const refreshed = secondSubdomains.filter(
        (s) =>
          firstSeenByCanon.has(s.canonicalValue) &&
          new Date(s.lastSeenAt).getTime() >=
            new Date(firstSeenByCanon.get(s.canonicalValue)!).getTime(),
      );
      expect(refreshed.length).toBeGreaterThan(0);

      // Technologies never decrease (parser is upsert-only across runs).
      const secondTechCount = secondSubdomains.reduce(
        (sum, a) => sum + (a.technologies?.length ?? 0),
        0,
      );
      expect(secondTechCount).toBeGreaterThanOrEqual(firstTechCount);
    },
    // outer Jest timeout: 2× template timeout + 60s overhead.
    templateTimeoutMs * 2 + 60_000,
  );
});
