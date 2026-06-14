import { hostname as osHostname } from 'node:os';
import { spawnSync } from 'node:child_process';

import { generateAgentKeypair, signAgentMessage } from '@autoscanner/common';

import type {
  ApiClient,
  AgentHeartbeatBody,
  AgentClaimBody,
  AgentSubmitResultBody,
  AgentSummary,
} from '../lib/api-client';
import type { AgentStore, AgentState } from '../lib/agent-store';

// ── Types ──────────────────────────────────────────────────────────────────

export interface AgentRegisterOptions {
  apiUrl: string;
  token: string;
  name?: string;
}

export interface AgentRunOptions {
  intervalMs?: number;
  once?: boolean;
}

export interface AgentRegisterDeps {
  enrollAgent: ApiClient['enrollAgent'];
  store: AgentStore;
  log: (msg: string) => void;
}

export interface AgentRunDeps {
  store: AgentStore;
  buildClient: (
    apiUrl: string,
  ) => Pick<ApiClient, 'agentHeartbeat' | 'agentClaim' | 'agentSubmitResult'>;
  log: (msg: string) => void;
}

export interface AgentListDeps {
  listAgents: ApiClient['listAgents'];
  log: (msg: string) => void;
}

// ── Register ───────────────────────────────────────────────────────────────

export async function runAgentRegister(
  deps: AgentRegisterDeps,
  opts: AgentRegisterOptions,
): Promise<void> {
  const { publicKeyBase64, privateKeyBase64 } = generateAgentKeypair();

  const result = await deps.enrollAgent({
    bootstrapToken: opts.token,
    publicKey: publicKeyBase64,
    capabilities: {
      os: process.platform,
      arch: process.arch,
      tools: [],
    },
    hostname: osHostname(),
  });

  const state: AgentState = {
    apiUrl: opts.apiUrl,
    agentId: result.agentId,
    privateKeyBase64,
  };
  await deps.store.save(state);
  deps.log(result.agentId);
}

// ── One iteration (heartbeat → claim → run → submit) ──────────────────────

/**
 * Executes one heartbeat + optional claim/run/submit cycle.
 * Returns true if a job was processed.
 */
export async function runAgentOnce(
  client: Pick<ApiClient, 'agentHeartbeat' | 'agentClaim' | 'agentSubmitResult'>,
  state: AgentState,
  log: (msg: string) => void,
): Promise<boolean> {
  const { agentId, privateKeyBase64 } = state;

  // Heartbeat
  const hbTs = new Date().toISOString();
  const hbSig = signAgentMessage(privateKeyBase64, `${agentId}|${hbTs}`);
  const hbBody: AgentHeartbeatBody = { agentId, ts: hbTs, signature: hbSig };
  await client.agentHeartbeat(hbBody);

  // Claim
  const claimTs = new Date().toISOString();
  const claimSig = signAgentMessage(privateKeyBase64, `claim|${agentId}|${claimTs}`);
  const claimBody: AgentClaimBody = { agentId, ts: claimTs, signature: claimSig };
  const job = await client.agentClaim(claimBody);

  if (!job) return false;

  log(`claimed job ${job.jobId} (scanner=${job.scannerName} target=${job.target})`);

  // Execute the scanner locally
  let exitCode: number;
  let rawOutput: string;

  const result = spawnSync(job.scannerName, [job.target], {
    encoding: 'buffer',
    timeout: 300_000, // 5 min safeguard
  });

  if (result.error) {
    const err = result.error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      exitCode = 127;
      rawOutput = `scanner not found: ${job.scannerName}: ${err.message}`;
    } else {
      exitCode = result.status ?? 1;
      rawOutput = err.message;
    }
  } else {
    exitCode = result.status ?? 0;
    const stdout = result.stdout ?? Buffer.alloc(0);
    const stderr = result.stderr ?? Buffer.alloc(0);
    rawOutput = Buffer.concat([stdout, stderr]).toString('utf8');
  }

  const rawOutputBase64 = Buffer.from(rawOutput, 'utf8').toString('base64');

  // Submit result
  const resultTs = new Date().toISOString();
  const resultSig = signAgentMessage(
    privateKeyBase64,
    `result|${job.jobId}|${agentId}|${resultTs}`,
  );
  const submitBody: AgentSubmitResultBody = {
    agentId,
    ts: resultTs,
    signature: resultSig,
    exitCode,
    rawOutputBase64,
  };
  await client.agentSubmitResult(job.jobId, submitBody);

  log(`submitted result for job ${job.jobId} (exitCode=${exitCode})`);
  return true;
}

// ── Run loop ───────────────────────────────────────────────────────────────

export async function runAgentRun(deps: AgentRunDeps, opts: AgentRunOptions): Promise<void> {
  const state = await deps.store.load();
  if (!state) {
    throw new Error('Agent not registered. Run `autoscanner agent register` first.');
  }

  const client = deps.buildClient(state.apiUrl);

  if (opts.once) {
    await runAgentOnce(client, state, deps.log);
    return;
  }

  const intervalMs = opts.intervalMs ?? 30_000;
  deps.log(`agent ${state.agentId} polling every ${intervalMs}ms`);

  const tick = (): void => {
    runAgentOnce(client, state, deps.log).catch((err: unknown) => {
      deps.log(`error in agent loop: ${err instanceof Error ? err.message : String(err)}`);
    });
  };

  tick();
  setInterval(tick, intervalMs);
}

// ── List ───────────────────────────────────────────────────────────────────

export async function runAgentList(deps: AgentListDeps): Promise<AgentSummary[]> {
  const agents = await deps.listAgents();
  for (const a of agents) {
    deps.log(`${a.id}\t${a.name}\t${a.status}\t${a.lastHeartbeatAt ?? ''}`);
  }
  return agents;
}
