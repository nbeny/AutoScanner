/**
 * Phase 1 acceptance: login → create engagement → queue nmap scan →
 * watch it complete → verify Asset/Port/Service in DB (via GraphQL) →
 * verify raw XML is downloadable via the presigned URL.
 *
 * This suite is opt-in: it skips unless E2E_API_URL is set. It assumes
 * the full stack is already running (docker compose + api-gateway +
 * scan-worker + parser-worker), and that the named operator account
 * exists.
 *
 * Required env:
 *   E2E_API_URL        e.g. http://localhost:3000
 *   E2E_EMAIL          existing operator email
 *   E2E_PASSWORD       existing operator password
 * Optional:
 *   E2E_TARGET         scan target (default: 127.0.0.1)
 *   E2E_SCAN_TIMEOUT_MS  poll timeout, ms (default: 300000 = 5 min)
 */

import { GraphQLClient } from 'graphql-request';

const apiUrl = process.env['E2E_API_URL'];
const email = process.env['E2E_EMAIL'];
const password = process.env['E2E_PASSWORD'];
const target = process.env['E2E_TARGET'] ?? '127.0.0.1';
const scanTimeoutMs = Number(process.env['E2E_SCAN_TIMEOUT_MS'] ?? 300_000);

const describeOrSkip = apiUrl && email && password ? describe : describe.skip;

interface AuthPayload {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface Engagement {
  id: string;
  name: string;
  status: string;
}

interface ScanJob {
  id: string;
  scannerName: string;
  target: string;
  status: string;
  rawOutputKey?: string | null;
}

interface Scan {
  id: string;
  status: string;
  completedAt?: string | null;
  jobs: ScanJob[];
}

interface Asset {
  id: string;
  value: string;
  type: string;
  ports?: { number: number; protocol: string; state: string; services?: { name?: string }[] }[];
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

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describeOrSkip('Phase 1 — first scan E2E', () => {
  let gql: GraphQLClient;
  let accessToken: string;

  beforeAll(async () => {
    const auth = await restLogin();
    accessToken = auth.accessToken;
    gql = new GraphQLClient(`${apiUrl!}/graphql`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
  }, 30_000);

  it(
    'runs nmap against the target and exposes assets + raw output',
    async () => {
      const engagementName = `e2e-${Date.now()}`;
      const created = await gql.request<{ createEngagement: Engagement }>(
        /* GraphQL */ `
          mutation Create($input: CreateEngagementInput!) {
            createEngagement(input: $input) {
              id
              name
              status
            }
          }
        `,
        { input: { name: engagementName, clientName: 'e2e-client' } },
      );
      expect(created.createEngagement.id).toBeTruthy();
      const engagementId = created.createEngagement.id;

      const queued = await gql.request<{ runScan: Scan }>(
        /* GraphQL */ `
          mutation Run($input: RunScanInput!) {
            runScan(input: $input) {
              id
              status
              jobs {
                id
                scannerName
                target
                status
              }
            }
          }
        `,
        {
          input: {
            engagementId,
            scannerName: 'nmap',
            target,
            optionsJson: JSON.stringify({ ports: '22,80,443', serviceDetection: true }),
          },
        },
      );
      expect(queued.runScan.jobs.length).toBeGreaterThan(0);
      const scanId = queued.runScan.id;

      const deadline = Date.now() + scanTimeoutMs;
      let final: Scan | null = null;
      while (Date.now() < deadline) {
        const polled = await gql.request<{ scan: Scan }>(
          /* GraphQL */ `
            query S($id: ID!) {
              scan(id: $id) {
                id
                status
                completedAt
                jobs {
                  id
                  scannerName
                  target
                  status
                  rawOutputKey
                }
              }
            }
          `,
          { id: scanId },
        );
        if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(polled.scan.status)) {
          final = polled.scan;
          break;
        }
        await sleep(2000);
      }

      expect(final).not.toBeNull();
      expect(final!.status).toBe('COMPLETED');

      const job = final!.jobs[0];
      expect(job.rawOutputKey).toBeTruthy();

      const assetsRes = await gql.request<{ assets: Asset[] }>(
        /* GraphQL */ `
          query A($id: ID!) {
            assets(engagementId: $id) {
              id
              value
              type
              ports {
                number
                protocol
                state
                services {
                  name
                }
              }
            }
          }
        `,
        { id: engagementId },
      );
      expect(assetsRes.assets.length).toBeGreaterThan(0);
      const a = assetsRes.assets.find((x) => x.value === target) ?? assetsRes.assets[0];
      expect(a.ports?.length ?? 0).toBeGreaterThan(0);

      const rawRes = await fetch(`${apiUrl!}/scan-jobs/${job.id}/raw`, {
        method: 'GET',
        redirect: 'manual',
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect([301, 302]).toContain(rawRes.status);
      const presigned = rawRes.headers.get('location');
      expect(presigned).toBeTruthy();

      const xmlRes = await fetch(presigned!);
      expect(xmlRes.ok).toBe(true);
      const xml = await xmlRes.text();
      expect(xml).toContain('<nmaprun');
    },
    scanTimeoutMs + 60_000,
  );
});
