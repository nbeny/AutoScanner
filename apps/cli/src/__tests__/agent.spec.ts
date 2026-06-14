import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { generateAgentKeypair, signAgentMessage, verifyAgentSignature } from '@autoscanner/common';

import { AgentStore } from '../lib/agent-store';
import { runAgentRegister, runAgentOnce, runAgentList } from '../commands/agent';
import type { AgentRegisterDeps, AgentListDeps } from '../commands/agent';
import type {
  AgentHeartbeatBody,
  AgentClaimBody,
  AgentSubmitResultBody,
  AgentClaimResult,
} from '../lib/api-client';

// ── helpers ────────────────────────────────────────────────────────────────

function makeTmpStore(): { store: AgentStore; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'autoscanner-agent-test-'));
  const store = new AgentStore(join(dir, 'agent.json'));
  return { store, dir };
}

// ── runAgentRegister ───────────────────────────────────────────────────────

describe('runAgentRegister', () => {
  let dir: string;
  let store: AgentStore;

  beforeEach(() => {
    ({ dir, store } = makeTmpStore());
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('calls enrollAgent with a non-empty publicKey and persists agentId + privateKey', async () => {
    const enrollAgent = jest.fn().mockResolvedValue({ agentId: 'agent_abc123' });
    const logs: string[] = [];

    const deps: AgentRegisterDeps = {
      enrollAgent,
      store,
      log: (m) => logs.push(m),
    };

    await runAgentRegister(deps, {
      apiUrl: 'http://localhost:3000',
      token: 'bootstrap_token_xyz',
    });

    // enrollAgent was called once
    expect(enrollAgent).toHaveBeenCalledTimes(1);

    const callArg = enrollAgent.mock.calls[0][0] as {
      bootstrapToken: string;
      publicKey: string;
      capabilities: { os: string; arch: string; tools: unknown[] };
      hostname: string;
    };

    // bootstrap token forwarded
    expect(callArg.bootstrapToken).toBe('bootstrap_token_xyz');

    // publicKey is a non-empty base64 string (spki DER)
    expect(typeof callArg.publicKey).toBe('string');
    expect(callArg.publicKey.length).toBeGreaterThan(10);

    // capabilities shape
    expect(callArg.capabilities.tools).toEqual([]);
    expect(typeof callArg.capabilities.os).toBe('string');

    // agentId logged
    expect(logs).toContain('agent_abc123');

    // state persisted
    const saved = await store.load();
    expect(saved).not.toBeNull();
    expect(saved!.agentId).toBe('agent_abc123');
    expect(saved!.apiUrl).toBe('http://localhost:3000');
    expect(typeof saved!.privateKeyBase64).toBe('string');
    expect(saved!.privateKeyBase64.length).toBeGreaterThan(10);
  });

  it('the stored privateKey is the complement of the publicKey sent to enrollAgent', async () => {
    // Intercept the publicKey sent during enroll and verify that the stored
    // private key can sign a message that the captured public key validates.
    let capturedPublicKey = '';
    const enrollAgent = jest.fn().mockImplementation((body: { publicKey: string }) => {
      capturedPublicKey = body.publicKey;
      return Promise.resolve({ agentId: 'agent_pair_test' });
    });

    await runAgentRegister(
      { enrollAgent, store, log: () => undefined },
      { apiUrl: 'http://localhost:3000', token: 'tok' },
    );

    const saved = await store.load();
    expect(saved).not.toBeNull();

    const msg = 'hello-world';
    const sig = signAgentMessage(saved!.privateKeyBase64, msg);
    expect(verifyAgentSignature(capturedPublicKey, msg, sig)).toBe(true);
  });
});

// ── runAgentOnce ───────────────────────────────────────────────────────────

describe('runAgentOnce', () => {
  const { publicKeyBase64, privateKeyBase64 } = generateAgentKeypair();
  const agentState = {
    apiUrl: 'http://localhost:3000',
    agentId: 'agent_xyz',
    privateKeyBase64,
  };

  it('returns false and does not call agentSubmitResult when no job is available', async () => {
    const agentHeartbeat = jest.fn().mockResolvedValue(undefined);
    const agentClaim = jest.fn().mockResolvedValue(null);
    const agentSubmitResult = jest.fn();

    const processed = await runAgentOnce(
      { agentHeartbeat, agentClaim, agentSubmitResult },
      agentState,
      () => undefined,
    );

    expect(processed).toBe(false);
    expect(agentSubmitResult).not.toHaveBeenCalled();
  });

  it('calls agentSubmitResult with a base64 rawOutput when a job is claimed', async () => {
    const fakeJob: AgentClaimResult = {
      jobId: 'job_001',
      scannerName: '__nonexistent_scanner_abc__',
      target: '127.0.0.1',
    };

    const agentHeartbeat = jest.fn().mockResolvedValue(undefined);
    const agentClaim = jest.fn().mockResolvedValue(fakeJob);
    const agentSubmitResult = jest.fn().mockResolvedValue(undefined);
    const logs: string[] = [];

    const processed = await runAgentOnce(
      { agentHeartbeat, agentClaim, agentSubmitResult },
      agentState,
      (m) => logs.push(m),
    );

    expect(processed).toBe(true);
    expect(agentSubmitResult).toHaveBeenCalledTimes(1);

    const [jobId, body] = agentSubmitResult.mock.calls[0] as [string, AgentSubmitResultBody];
    expect(jobId).toBe('job_001');

    // rawOutput is valid base64
    expect(typeof body.rawOutputBase64).toBe('string');
    const decoded = Buffer.from(body.rawOutputBase64, 'base64').toString('utf8');
    expect(decoded.length).toBeGreaterThanOrEqual(0); // could be empty for ENOENT

    // Scanner not found → exitCode 127
    expect(body.exitCode).toBe(127);

    // agentId forwarded
    expect(body.agentId).toBe('agent_xyz');
  });

  it('produces a valid signature for the result canonical string', async () => {
    const fakeJob: AgentClaimResult = {
      jobId: 'job_sig_test',
      scannerName: '__nonexistent_sig_test__',
      target: 'target',
    };

    const agentHeartbeat = jest.fn().mockResolvedValue(undefined);
    const agentClaim = jest.fn().mockResolvedValue(fakeJob);

    let capturedBody: AgentSubmitResultBody | undefined;
    const agentSubmitResult = jest
      .fn()
      .mockImplementation((_jobId: string, body: AgentSubmitResultBody) => {
        capturedBody = body;
        return Promise.resolve();
      });

    await runAgentOnce(
      { agentHeartbeat, agentClaim, agentSubmitResult },
      agentState,
      () => undefined,
    );

    expect(capturedBody).toBeDefined();
    const { ts, signature, agentId } = capturedBody!;
    const canonical = `result|job_sig_test|${agentId}|${ts}`;
    expect(verifyAgentSignature(publicKeyBase64, canonical, signature)).toBe(true);
  });

  it('produces a valid signature for the heartbeat canonical string', async () => {
    const agentHeartbeat = jest.fn().mockResolvedValue(undefined);
    const agentClaim = jest.fn().mockResolvedValue(null);
    const agentSubmitResult = jest.fn();

    let capturedHb: AgentHeartbeatBody | undefined;
    agentHeartbeat.mockImplementation((body: AgentHeartbeatBody) => {
      capturedHb = body;
      return Promise.resolve();
    });

    await runAgentOnce(
      { agentHeartbeat, agentClaim, agentSubmitResult },
      agentState,
      () => undefined,
    );

    expect(capturedHb).toBeDefined();
    const { ts, signature, agentId } = capturedHb!;
    const canonical = `${agentId}|${ts}`;
    expect(verifyAgentSignature(publicKeyBase64, canonical, signature)).toBe(true);
  });

  it('produces a valid signature for the claim canonical string', async () => {
    const agentHeartbeat = jest.fn().mockResolvedValue(undefined);

    let capturedClaim: AgentClaimBody | undefined;
    const agentClaim = jest.fn().mockImplementation((body: AgentClaimBody) => {
      capturedClaim = body;
      return Promise.resolve(null);
    });
    const agentSubmitResult = jest.fn();

    await runAgentOnce(
      { agentHeartbeat, agentClaim, agentSubmitResult },
      agentState,
      () => undefined,
    );

    expect(capturedClaim).toBeDefined();
    const { ts, signature, agentId } = capturedClaim!;
    const canonical = `claim|${agentId}|${ts}`;
    expect(verifyAgentSignature(publicKeyBase64, canonical, signature)).toBe(true);
  });
});

// ── runAgentList ───────────────────────────────────────────────────────────

describe('runAgentList', () => {
  it('prints one line per agent and returns the list', async () => {
    const agents = [
      { id: 'a1', name: 'alpha', status: 'ACTIVE', lastHeartbeatAt: '2026-01-01T00:00:00.000Z' },
      { id: 'a2', name: 'beta', status: 'IDLE', lastHeartbeatAt: null },
    ];
    const listAgents = jest.fn().mockResolvedValue(agents);
    const logs: string[] = [];

    const deps: AgentListDeps = {
      listAgents,
      log: (m) => logs.push(m),
    };

    const result = await runAgentList(deps);

    expect(result).toEqual(agents);
    expect(logs).toHaveLength(2);
    expect(logs[0]).toContain('a1');
    expect(logs[0]).toContain('alpha');
    expect(logs[0]).toContain('ACTIVE');
    expect(logs[1]).toContain('a2');
  });
});
