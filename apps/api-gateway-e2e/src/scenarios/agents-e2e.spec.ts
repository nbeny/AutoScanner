/**
 * Phase 5.4 acceptance: agent lifecycle over REST + GraphQL.
 *
 * Scenario (no live scan-worker needed — the test plays the agent role directly):
 *  1. Operator login → authedGqlClient.
 *  2. GraphQL `createAgentRegistration` → bootstrapToken + agentId.
 *  3. Generate ed25519 keypair inline (Node crypto); POST /agents/enroll → 200 + agentId.
 *  4. POST /agents/heartbeat (signed) → 204.
 *  5. GraphQL `agents` → agent present with status ACTIVE; no publicKey field in projection.
 *  6. Create engagement + wildcard scope; runScan with agentId → scan + job queued for agent.
 *  7. POST /agents/jobs/claim (signed) → job with expected jobId.
 *  8. POST /agents/jobs/:id/result (signed, exitCode 0) → 204.
 *  9. Poll GraphQL `scan(id)` until job is COMPLETED (or timeout) → assert COMPLETED.
 *
 * Opt-in: skips unless E2E_API_URL + E2E_EMAIL + E2E_PASSWORD are all set
 * AND `AGENT_E2E=1`.
 *
 * NOTE: ed25519 crypto is implemented inline using Node's built-in `crypto`
 * module rather than `@autoscanner/common` because the e2e project has no
 * existing workspace-lib imports and the tsconfig path aliases are inherited
 * from tsconfig.base.json but the e2e runner does not transpile lib source —
 * inline crypto avoids the extra build dependency.
 *
 * Required env:
 *   E2E_API_URL    e.g. http://localhost:4000
 *   E2E_EMAIL      existing operator email
 *   E2E_PASSWORD   existing operator password
 *   AGENT_E2E=1    explicit opt-in
 */

import { generateKeyPairSync, sign as cryptoSign, createPrivateKey } from 'node:crypto';
import type { GraphQLClient } from 'graphql-request';
import {
  authedGqlClient,
  createEngagementWithWildcardScope,
  describeOrSkipE2E,
  readBaseEnv,
  restLogin,
  sleep,
} from '../helpers';

// ---------------------------------------------------------------------------
// Inline ed25519 helpers (mirror of @autoscanner/common agent-signature.ts)
// ---------------------------------------------------------------------------

interface AgentKeypair {
  publicKeyBase64: string;
  privateKeyBase64: string;
}

function generateAgentKeypair(): AgentKeypair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKeyBase64: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    privateKeyBase64: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
  };
}

function signAgentMessage(privateKeyBase64: string, message: string): string {
  const key = createPrivateKey({
    key: Buffer.from(privateKeyBase64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  return cryptoSign(null, Buffer.from(message, 'utf8'), key).toString('base64');
}

// ---------------------------------------------------------------------------
// GraphQL documents
// ---------------------------------------------------------------------------

const CREATE_AGENT_REGISTRATION = /* GraphQL */ `
  mutation CreateAgentRegistration($input: CreateAgentRegistrationInput!) {
    createAgentRegistration(input: $input) {
      agentId
      bootstrapToken
    }
  }
`;

const AGENTS_QUERY = /* GraphQL */ `
  query Agents {
    agents {
      id
      name
      status
      hostname
      lastHeartbeatAt
      enrolledAt
    }
  }
`;

const RUN_SCAN_WITH_AGENT = /* GraphQL */ `
  mutation RunScan($input: RunScanInput!) {
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
`;

const SCAN_JOBS_QUERY = /* GraphQL */ `
  query ScanJobs($id: ID!) {
    scan(id: $id) {
      id
      status
      jobs {
        id
        status
        rawOutputKey
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

const env = readBaseEnv();
const agentE2eEnabled = process.env['AGENT_E2E'] === '1';
const describeOrSkip = agentE2eEnabled ? describeOrSkipE2E(env) : describe.skip;

interface AgentRow {
  id: string;
  name: string;
  status: string;
  hostname?: string | null;
  lastHeartbeatAt?: string | null;
  enrolledAt?: string | null;
}

interface ScanWithJobs {
  id: string;
  status: string;
  jobs: { id: string; status: string; rawOutputKey?: string | null }[];
}

describeOrSkip('Agents e2e (AGENT_E2E)', () => {
  let gql: GraphQLClient;

  beforeAll(async () => {
    const auth = await restLogin(env.apiUrl!, env.email!, env.password!);
    gql = authedGqlClient(env.apiUrl!, auth.accessToken);
  });

  it('enrolls an agent, heartbeats, creates an agent-routed scan, claims it, and submits a result', async () => {
    const apiUrl = env.apiUrl!;
    const agentName = `e2e-agent-${Date.now()}`;

    // ── Step 2: operator creates agent registration ──────────────────────
    const { createAgentRegistration } = await gql.request<{
      createAgentRegistration: { agentId: string; bootstrapToken: string };
    }>(CREATE_AGENT_REGISTRATION, { input: { name: agentName } });

    expect(createAgentRegistration.agentId).toBeTruthy();
    expect(createAgentRegistration.bootstrapToken).toBeTruthy();
    const { agentId, bootstrapToken } = createAgentRegistration;

    // ── Step 3: generate ed25519 keypair + enroll via REST ───────────────
    const keypair = generateAgentKeypair();

    const enrollRes = await fetch(`${apiUrl}/agents/enroll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        bootstrapToken,
        publicKey: keypair.publicKeyBase64,
        capabilities: { os: 'linux', arch: 'x64', tools: ['nmap'] },
        hostname: 'e2e',
      }),
    });
    expect(enrollRes.status).toBe(200);
    const enrollBody = (await enrollRes.json()) as { agentId: string };
    expect(enrollBody.agentId).toBe(agentId);

    // ── Step 4: heartbeat (signed) ────────────────────────────────────────
    const ts1 = new Date().toISOString();
    const heartbeatSig = signAgentMessage(keypair.privateKeyBase64, `${agentId}|${ts1}`);

    const hbRes = await fetch(`${apiUrl}/agents/heartbeat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agentId, ts: ts1, signature: heartbeatSig }),
    });
    expect(hbRes.status).toBe(204);

    // ── Step 5: GraphQL agents list → agent is ACTIVE; no publicKey field ─
    const { agents } = await gql.request<{ agents: AgentRow[] }>(AGENTS_QUERY);
    const listed = agents.find((a) => a.id === agentId);
    expect(listed).toBeDefined();
    expect(listed!.status).toBe('ACTIVE');
    // publicKey must not appear in the GraphQL projection
    expect((listed as unknown as Record<string, unknown>)['publicKey']).toBeUndefined();

    // ── Step 6: create engagement + wildcard scope + agent-routed scan ────
    const { engagementId } = await createEngagementWithWildcardScope(gql, {
      namePrefix: 'agent-e2e',
      clientName: 'agent-e2e',
      target: '*.example.com',
    });

    const { runScan: scan } = await gql.request<{
      runScan: {
        id: string;
        status: string;
        jobs: { id: string; scannerName: string; target: string; status: string }[];
      };
    }>(RUN_SCAN_WITH_AGENT, {
      input: {
        engagementId,
        scannerName: 'nmap',
        target: 'example.com',
        agentId,
      },
    });

    expect(scan.id).toBeTruthy();
    expect(scan.jobs.length).toBeGreaterThan(0);
    const scanId = scan.id;
    const expectedJobId = scan.jobs[0].id;

    // ── Step 7: claim job via REST (signed) ───────────────────────────────
    const ts2 = new Date().toISOString();
    const claimSig = signAgentMessage(keypair.privateKeyBase64, `claim|${agentId}|${ts2}`);

    const claimRes = await fetch(`${apiUrl}/agents/jobs/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agentId, ts: ts2, signature: claimSig }),
    });
    expect(claimRes.status).toBe(200);
    const claimBody = (await claimRes.json()) as {
      job: { jobId: string; scannerName: string; target: string } | null;
    };
    expect(claimBody.job).not.toBeNull();
    const claimedJobId = claimBody.job!.jobId;
    expect(claimedJobId).toBe(expectedJobId);
    expect(claimBody.job!.scannerName).toBe('nmap');

    // ── Step 8: submit result via REST (signed) ───────────────────────────
    const ts3 = new Date().toISOString();
    const rawOutput = '<nmaprun></nmaprun>';
    const rawOutputBase64 = Buffer.from(rawOutput).toString('base64');
    const resultSig = signAgentMessage(
      keypair.privateKeyBase64,
      `result|${claimedJobId}|${agentId}|${ts3}`,
    );

    const submitRes = await fetch(`${apiUrl}/agents/jobs/${claimedJobId}/result`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agentId,
        ts: ts3,
        signature: resultSig,
        exitCode: 0,
        rawOutputBase64,
      }),
    });
    expect(submitRes.status).toBe(204);

    // ── Step 9: poll until job is COMPLETED ───────────────────────────────
    const pollTimeoutMs = 30_000;
    const deadline = Date.now() + pollTimeoutMs;
    let finalScan: ScanWithJobs | null = null;

    while (Date.now() < deadline) {
      const { scan: polled } = await gql.request<{ scan: ScanWithJobs }>(SCAN_JOBS_QUERY, {
        id: scanId,
      });
      const job = polled.jobs.find((j) => j.id === claimedJobId);
      if (job && ['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.status)) {
        finalScan = polled;
        break;
      }
      await sleep(1_000);
    }

    expect(finalScan).not.toBeNull();
    const finalJob = finalScan!.jobs.find((j) => j.id === claimedJobId);
    expect(finalJob).toBeDefined();
    expect(finalJob!.status).toBe('COMPLETED');
  }, 60_000);
});
