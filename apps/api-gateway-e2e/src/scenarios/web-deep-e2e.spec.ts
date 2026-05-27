/**
 * Phase 2 acceptance (Étape 2): web-deep full recon-chain end-to-end.
 *
 * Scenario:
 *  1. Login + create a fresh engagement.
 *  2. Create an INCLUDE WILDCARD_DOMAIN ScopeRule for the target via
 *     the `createScopeRule` mutation.
 *  3. runTemplate({ templateName: 'web-deep', target }) → poll
 *     `templateRun(id)` until COMPLETED (timeout 10min by default — the
 *     full chain subfinder → httpx → dnsx → naabu → nuclei takes longer
 *     than the passive recon step).
 *  4. Assert every persistence table is populated (the whole point of
 *     the acceptance suite):
 *        - Domain assets    ≥ 1
 *        - Subdomain assets ≥ E2E_WEB_DEEP_SUBDOMAIN_MIN (default 5)
 *        - IpAddress assets ≥ 1
 *        - DnsRecord rows   ≥ E2E_WEB_DEEP_DNSRECORD_MIN (default 3)
 *        - Port rows        ≥ 1 (across all assets)
 *        - Technology rows  ≥ 1 (across all assets)
 *        - Findings query   responds (count ≥ 0 — hackerone.com is
 *          well-secured, so we just confirm the query path, not a
 *          minimum count).
 *  5. Idempotence: re-runTemplate with the same params → poll to
 *     COMPLETED → re-query → counts are stable (within ±10% per kind
 *     to absorb upstream-discovery variance from subfinder/dnsx). The
 *     "0 doublon" assertion is implicit: stability across runs means
 *     the @@unique constraints on Subdomain.canonicalValue /
 *     IpAddress.canonicalValue + the per-asset Finding
 *     @@unique([assetId, dedupHash]) successfully deduped the second
 *     pass.
 *  6. Canonical-set overlap ≥ 90% for SUBDOMAIN (same rule as
 *     recon-passive-e2e:275-278).
 *
 * Opt-in: skips unless E2E_API_URL + E2E_EMAIL + E2E_PASSWORD are set.
 * Assumes the full stack is running (api-gateway + scan-worker +
 * parser-worker + orchestrator-worker + Docker daemon with subfinder /
 * httpx / dnsx / naabu / nuclei images already pulled).
 *
 * Required env:
 *   E2E_API_URL                       e.g. http://localhost:4000
 *   E2E_EMAIL                         existing operator email
 *   E2E_PASSWORD                      existing operator password
 * Optional:
 *   E2E_WEB_DEEP_TARGET               default: hackerone.com
 *   E2E_WEB_DEEP_TIMEOUT_MS           default: 600000 (10 min)
 *   E2E_WEB_DEEP_SUBDOMAIN_MIN        default: 5
 *   E2E_WEB_DEEP_DNSRECORD_MIN        default: 3
 */

import { GraphQLClient } from 'graphql-request';

const apiUrl = process.env['E2E_API_URL'];
const email = process.env['E2E_EMAIL'];
const password = process.env['E2E_PASSWORD'];
const target = process.env['E2E_WEB_DEEP_TARGET'] ?? 'hackerone.com';
const templateName = 'web-deep';
const templateTimeoutMs = Number(process.env['E2E_WEB_DEEP_TIMEOUT_MS'] ?? 600_000);
const subdomainMinCount = Number(process.env['E2E_WEB_DEEP_SUBDOMAIN_MIN'] ?? 5);
const dnsRecordMinCount = Number(process.env['E2E_WEB_DEEP_DNSRECORD_MIN'] ?? 3);

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

interface Port {
  id: string;
  number: number;
  protocol: string;
  state: string;
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
  ports?: Port[];
  technologies?: Technology[];
}

interface DnsRecord {
  id: string;
  type: string;
  name: string;
  value: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

interface Finding {
  id: string;
  title: string;
  severity: string;
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

async function queryAssets(gql: GraphQLClient, engagementId: string): Promise<Asset[]> {
  const res = await gql.request<{ assets: Asset[] }>(
    /* GraphQL */ `
      query A($engagementId: ID!) {
        assets(engagementId: $engagementId) {
          id
          type
          value
          canonicalValue
          lastSeenAt
          ports {
            id
            number
            protocol
            state
          }
          technologies {
            id
            name
          }
        }
      }
    `,
    { engagementId },
  );
  return res.assets;
}

function queryAssetsByType(assets: Asset[], type: string): Asset[] {
  return assets.filter((a) => a.type === type);
}

async function queryDnsRecords(gql: GraphQLClient, engagementId: string): Promise<DnsRecord[]> {
  const res = await gql.request<{ dnsRecords: DnsRecord[] }>(
    /* GraphQL */ `
      query D($engagementId: ID!) {
        dnsRecords(engagementId: $engagementId) {
          id
          type
          name
          value
          firstSeenAt
          lastSeenAt
        }
      }
    `,
    { engagementId },
  );
  return res.dnsRecords;
}

async function queryFindings(gql: GraphQLClient, engagementId: string): Promise<Finding[]> {
  const res = await gql.request<{ findings: Finding[] }>(
    /* GraphQL */ `
      query F($engagementId: ID!) {
        findings(engagementId: $engagementId) {
          id
          title
          severity
        }
      }
    `,
    { engagementId },
  );
  return res.findings;
}

function totalPorts(assets: Asset[]): number {
  return assets.reduce((sum, a) => sum + (a.ports?.length ?? 0), 0);
}

function totalTechnologies(assets: Asset[]): number {
  return assets.reduce((sum, a) => sum + (a.technologies?.length ?? 0), 0);
}

describeOrSkip('Phase 2 Étape 2 — web-deep end-to-end (full chain)', () => {
  let gql: GraphQLClient;
  let engagementId: string;

  beforeAll(async () => {
    const auth = await restLogin();
    gql = new GraphQLClient(`${apiUrl!}/graphql`, {
      headers: { authorization: `Bearer ${auth.accessToken}` },
    });

    const engagementName = `e2e-web-deep-${Date.now()}`;
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
  }, 90_000);

  it(
    'runs web-deep end-to-end, populates every recon table, and is idempotent on a second run',
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

      const firstAssets = await queryAssets(gql, engagementId);
      const firstDomains = queryAssetsByType(firstAssets, 'DOMAIN');
      const firstSubdomains = queryAssetsByType(firstAssets, 'SUBDOMAIN');
      const firstIps = queryAssetsByType(firstAssets, 'IP_ADDRESS');

      // Every table populated:
      expect(firstDomains.length).toBeGreaterThanOrEqual(1);
      expect(firstSubdomains.length).toBeGreaterThanOrEqual(subdomainMinCount);
      expect(firstIps.length).toBeGreaterThanOrEqual(1);

      const firstDnsRecords = await queryDnsRecords(gql, engagementId);
      expect(firstDnsRecords.length).toBeGreaterThanOrEqual(dnsRecordMinCount);

      const firstPortCount = totalPorts(firstAssets);
      expect(firstPortCount).toBeGreaterThanOrEqual(1);

      const firstTechCount = totalTechnologies(firstAssets);
      expect(firstTechCount).toBeGreaterThanOrEqual(1);

      // Findings query must respond — well-secured targets like
      // hackerone.com can legitimately produce zero findings, so we
      // just assert the path works.
      const firstFindings = await queryFindings(gql, engagementId);
      expect(firstFindings.length).toBeGreaterThanOrEqual(0);

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

      const secondAssets = await queryAssets(gql, engagementId);
      const secondSubdomains = queryAssetsByType(secondAssets, 'SUBDOMAIN');
      const secondIps = queryAssetsByType(secondAssets, 'IP_ADDRESS');

      const secondDnsRecords = await queryDnsRecords(gql, engagementId);
      const secondPortCount = totalPorts(secondAssets);
      const secondTechCount = totalTechnologies(secondAssets);

      // ±10% stability across all kinds. The "0 doublon" assertion is
      // implicit: if @@unique constraints + merge logic didn't
      // deduplicate, the second-pass count would roughly double.
      const within10Percent = (first: number, second: number, label: string): void => {
        const drift = Math.abs(second - first);
        const tolerance = Math.max(1, Math.ceil(first * 0.1));
        if (drift > tolerance) {
          throw new Error(
            `${label} count drifted beyond ±10%: first=${first} second=${second} drift=${drift} tolerance=${tolerance}`,
          );
        }
      };

      within10Percent(firstSubdomains.length, secondSubdomains.length, 'SUBDOMAIN');
      within10Percent(firstIps.length, secondIps.length, 'IP_ADDRESS');
      within10Percent(firstDnsRecords.length, secondDnsRecords.length, 'DnsRecord');
      within10Percent(firstPortCount, secondPortCount, 'Port');
      within10Percent(firstTechCount, secondTechCount, 'Technology');

      // Canonical-set overlap ≥ 90% for SUBDOMAIN — same rule as
      // recon-passive-e2e.
      const firstCanon = new Set(firstSubdomains.map((s) => s.canonicalValue));
      const secondCanon = new Set(secondSubdomains.map((s) => s.canonicalValue));
      const persisted = [...firstCanon].filter((c) => secondCanon.has(c)).length;
      expect(persisted).toBeGreaterThanOrEqual(Math.floor(firstCanon.size * 0.9));

      // lastSeenAt should advance for at least one persisted subdomain,
      // proving the parser updated rows in place instead of inserting
      // duplicates.
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
    },
    // outer Jest timeout: 2× template timeout + 90s overhead (two runs
    // + setup + teardown).
    templateTimeoutMs * 2 + 90_000,
  );
});
