# Phase 5.4 — Distributed Agents (v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]`.

> **Date:** 2026-06-14
> **Spec:** `docs/superpowers/specs/2026-06-12-phase-5-...-design.md` §2 (5.4), §3.1 (Agent model), §4 (agent security), §5.4.
> **Branch:** `phase-5-4-agents` (off `main`).

**Goal:** Enrol an external agent (one-time token → ed25519 keypair), have it heartbeat, claim an agent-routed `ScanJob`, run it locally, and submit results that persist through the normal parse pipeline.

**Architecture:** An `Agent` is created PENDING via an operator GraphQL mutation that returns a single-use `bootstrapToken`. The agent CLI generates an ed25519 keypair locally and calls REST `POST /agents/enroll` (token → stores publicKey, ACTIVE, token consumed). All subsequent agent calls (`/agents/heartbeat`, `/agents/jobs/claim`, `/agents/jobs/:id/result`) are authenticated by an **ed25519 signature** over the request body, verified against the stored publicKey (no JWT). Scan routing: `runScan` accepts an optional `agentId`; when set, the `ScanJob` is created with `agentId` and **NOT** enqueued to `scan-jobs` (the mutualised scan-worker never sees it) — the agent claims it via REST. On result submit, the server stores raw output to object storage and enqueues `parse-jobs`, reusing the existing normalisation pipeline.

**Tech Stack:** NestJS REST + GraphQL, Prisma, Node `crypto` (ed25519), BullMQ, `commander` CLI, `graphql-request`, Jest/Vitest.

---

## Pre-requisites / context
- **REST auth model:** `JwtAuthGuard` is **opt-in** (added per-route/resolver), NOT global. A new `@Controller('agents')` is therefore public by default; we authenticate inside via signature. Mirror `apps/api-gateway/src/app/auth/auth.controller.ts` for controller style (`@Post`, `@HttpCode`, `@Body`, `@Req`, `@Ip`).
- **ed25519 via Node `crypto`:** `generateKeyPairSync('ed25519')` → `{publicKey, privateKey}` (export as `spki`/`pkcs8` PEM, or DER base64). `sign(null, Buffer, privateKey)` / `verify(null, Buffer, publicKey, sig)` (algorithm MUST be `null` for ed25519). Canonical message = the exact request-body JSON string the client sent (sign the raw bytes; server verifies the received raw body) — to avoid re-serialisation drift, sign a STABLE canonical string: `\`${agentId}.${ts}.${sha256(bodyJson)}\`` is over-engineering for v1; instead sign the **raw JSON string** and have the controller read it with a body interceptor, OR (simpler, chosen) sign a canonical tuple string built from explicit fields. **Decision:** each signed endpoint defines a canonical string from explicit fields (documented per endpoint) — e.g. heartbeat signs `\`${agentId}|${ts}\``. The client builds the same string. This avoids JSON-canonicalisation pitfalls.
- **Replay protection (v1):** require `ts` (ISO) within ±120s of server time; reject otherwise. (No nonce store in v1.)
- **Scan routing point:** `apps/api-gateway/src/app/scans/scans.service.ts` `runScan` — add optional `agentId`; when present, skip `scanQueue.add`.
- **Result→parse pipeline:** the scan-worker, on completing a job, stores raw output via `OBJECT_STORAGE` under `rawOutputKey(...)` and enqueues `parse-jobs` (`ParseJobPayload`). Mirror that: store the agent's submitted raw bytes, set `rawOutputKey`, enqueue `parse-jobs` with `{ scanJobId, rawOutputKey, parserName, scannerName, target, engagementId }`. Read `apps/scan-worker/src/app/scan-job.processor.ts` for the exact parse-enqueue shape + `rawOutputKey` helper from `@autoscanner/storage`.
- **CLI:** `commander` program in `apps/cli/src/main.ts`; `ConfigStore` persists JSON to disk; `ApiClient` wraps `graphql-request`. Add an `agent` command group + agent state (agentId + private key) to the config store (a separate file/section).
- **Crypto helper home:** add `libs/common/src/crypto/agent-signature.ts` and export from `libs/common/src/index.ts` (alongside `secret-box`).

---

## File Structure
- `prisma/schema.prisma` (+ migration) — `Agent`, `AgentStatus`, `ScanJob.agentId`, `User.agentsCreated`.
- `libs/common/src/crypto/agent-signature.ts` (+ test) — keygen/sign/verify + canonical-string helpers.
- `apps/api-gateway/src/app/agents/` — `agents.service.ts` (enrol/heartbeat/claim/submit/CRUD), `agents.controller.ts` (REST signed endpoints), `agents.resolver.ts` (GraphQL operator), `agent-signature.guard.ts` or inline verify, `dto/`, `agents.module.ts`, tests. Register in `app.module.ts`.
- `apps/api-gateway/src/app/scans/` — add `agentId` to `RunScanInput` + routing in `scans.service.ts` (+ test updates).
- `apps/cli/src/commands/agent.ts` + `lib/agent-store.ts` + wire into `main.ts` + `lib/api-client.ts` agent methods.
- Frontend: `apps/frontend/src/features/agents/agents-panel.tsx` (+ test) in settings page; GraphQL docs.
- `apps/api-gateway-e2e/src/scenarios/agents-e2e.spec.ts` (gated `AGENT_E2E`).

---

## T1 — Prisma: Agent model + ScanJob.agentId + migration

- [ ] **T1.1** — Add to `prisma/schema.prisma` (after `Notification`):

```prisma
enum AgentStatus { PENDING ACTIVE IDLE OFFLINE REVOKED }

model Agent {
  id                String      @id @default(cuid())
  name              String      @unique
  hostname          String?
  publicKey         String?
  registrationToken String?     @unique
  registrationExpiresAt DateTime?
  enrolledAt        DateTime?
  status            AgentStatus @default(PENDING)
  capabilities      Json?
  version           String?
  lastHeartbeatAt   DateTime?
  ipAddress         String?
  metadata          Json?
  createdById       String
  revokedAt         DateTime?
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt

  jobs              ScanJob[]
  createdBy         User        @relation(fields: [createdById], references: [id])

  @@index([status])
  @@index([lastHeartbeatAt])
}
```

- [ ] **T1.2** — `model ScanJob`: add `agentId String?` + `agent Agent? @relation(fields: [agentId], references: [id], onDelete: SetNull)` + `@@index([agentId])`. `model User`: add `agentsCreated Agent[]`.
- [ ] **T1.3** — Hand-write migration `prisma/migrations/20260614010000_phase5_agents/migration.sql` (no DB available — mirror an existing migration's SQL: CreateEnum, CreateTable Agent, AlterTable ScanJob ADD COLUMN agentId + index, AddForeignKeys; `Agent.createdById`→User restrict, `ScanJob.agentId`→Agent ON DELETE SET NULL). `pnpm prisma generate`.
- [ ] **T1.4** — Verify `type-check -p database,queues`. Commit: `feat(phase-5.4): Agent model + ScanJob.agentId`.

---

## T2 — `agent-signature` crypto helper (TDD)

- [ ] **T2.1** — Write failing test `libs/common/src/crypto/__tests__/agent-signature.spec.ts`: keygen produces a usable pair; `signAgentMessage`/`verifyAgentSignature` round-trip; a tampered message fails; a wrong key fails.

- [ ] **T2.2** — Implement `libs/common/src/crypto/agent-signature.ts`:

```ts
import { generateKeyPairSync, sign, verify, createPublicKey, createPrivateKey } from 'node:crypto';

export interface AgentKeypair { publicKeyBase64: string; privateKeyBase64: string; }

export function generateAgentKeypair(): AgentKeypair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKeyBase64: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    privateKeyBase64: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
  };
}

export function signAgentMessage(privateKeyBase64: string, message: string): string {
  const key = createPrivateKey({ key: Buffer.from(privateKeyBase64, 'base64'), format: 'der', type: 'pkcs8' });
  return sign(null, Buffer.from(message, 'utf8'), key).toString('base64');
}

export function verifyAgentSignature(publicKeyBase64: string, message: string, signatureBase64: string): boolean {
  try {
    const key = createPublicKey({ key: Buffer.from(publicKeyBase64, 'base64'), format: 'der', type: 'spki' });
    return verify(null, Buffer.from(message, 'utf8'), key, Buffer.from(signatureBase64, 'base64'));
  } catch {
    return false;
  }
}
```

- [ ] **T2.3** — Export from `libs/common/src/index.ts`. Green. Commit: `feat(phase-5.4): ed25519 agent signature helpers`.

---

## T3 — `agents` GraphQL (operator) + enrolment REST + service (TDD)

The service holds the business logic; the resolver is operator-JWT GraphQL; the controller is signature-auth REST.

- [ ] **T3.1** — `agents.service.ts` (inject `PrismaService`):
  - `createRegistration(userId, input{name, capabilities?})`: generate `registrationToken = randomBytes(32).toString('base64url')`, `registrationExpiresAt = now+24h`, create Agent PENDING with `createdById, name, capabilities, registrationToken, registrationExpiresAt`. Return `{ agent, bootstrapToken: registrationToken }`. (Name unique → catch P2002 → `ConflictError`.)
  - `enroll(input{bootstrapToken, publicKey, capabilities?, hostname?, version?}, ip)`: find Agent by `registrationToken`; if none / expired / already enrolled → throw. Update: `publicKey, status: ACTIVE, enrolledAt: now, registrationToken: null, capabilities, hostname, version, ipAddress: ip`. Return `{ agentId }`.
  - `verifyAndLoad(agentId, message, signature)`: load agent (must be ACTIVE/IDLE, not REVOKED, has publicKey); `verifyAgentSignature(publicKey, message, signature)` else throw `UnauthorizedException`. Returns the agent. Also enforce `ts` freshness (caller passes ts; reject if |now-ts|>120s).
  - `heartbeat(agentId, ts, signature, capabilities?, ip?)`: `verifyAndLoad` with canonical `\`${agentId}|${ts}\``; update `lastHeartbeatAt, status: ACTIVE, capabilities?, ipAddress?`.
  - `claimJob(agentId, ts, signature)`: verify with canonical `\`claim|${agentId}|${ts}\``; in a transaction, find oldest `ScanJob` where `agentId == agentId && status == 'QUEUED'`, mark `RUNNING, startedAt: now`; return `{ jobId, scannerName, target, input }` or null.
  - `submitResult(jobId, agentId, ts, signature, input{exitCode, rawOutputBase64})`: verify canonical `\`result|${jobId}|${agentId}|${ts}\``; load job (must belong to this agent + RUNNING); store raw bytes to object storage (`rawOutputKey`), set job `COMPLETED` (or `FAILED` if exitCode!=0) + `rawOutputKey, exitCode, completedAt`; enqueue `parse-jobs` (read scan-job.processor for shape). Inject `OBJECT_STORAGE` + `@InjectQueue(PARSE_JOBS)`.
  - `listForOwner(userId)`: agents where `createdById == userId`, order by createdAt desc.
  - `revoke(userId, id)`: ownership (createdById); set `status: REVOKED, revokedAt: now`. Return true.
  - TDD: createRegistration returns token + PENDING; enroll consumes token (sets ACTIVE, clears token) + rejects expired/used; verifyAndLoad rejects bad sig / revoked / stale ts; claimJob marks RUNNING + returns spec / returns null when none; submitResult stores + COMPLETED + enqueues parse; revoke ownership.

- [ ] **T3.2** — `dto/`: `AgentObject` (id,name,hostname,status,capabilities(JSON),version,lastHeartbeatAt,enrolledAt,createdAt — **never** publicKey/registrationToken), `AgentRegistrationResult` (agentId, bootstrapToken), `CreateAgentRegistrationInput` (name, capabilities JSON?), REST DTOs (`EnrollDto`, `HeartbeatDto`, `ClaimDto`, `SubmitResultDto`) with `class-validator`. Register `AgentStatus` GraphQL enum.

- [ ] **T3.3** — `agents.resolver.ts` (`@UseGuards(JwtAuthGuard)`, `@CurrentUser()`): `agents: [AgentObject]`, `createAgentRegistration(input): AgentRegistrationResult`, `revokeAgent(id): Boolean`.

- [ ] **T3.4** — `agents.controller.ts` `@Controller('agents')` (public): `POST enroll`, `POST heartbeat`, `POST jobs/claim`, `POST jobs/:id/result`. Each parses DTO, calls the service, maps domain errors to HTTP (401 for signature failures via `UnauthorizedException`). Use `@Ip()` for ipAddress.

- [ ] **T3.5** — `agents.module.ts` (imports `[AuthModule]`; providers service+resolver; controllers `[AgentsController]`; needs `StorageModule` for OBJECT_STORAGE + global QueuesModule). Register in `app.module.ts`. Verify `type-check,test -p api-gateway`. Commit: `feat(phase-5.4): agents service + GraphQL + signed REST (enroll/heartbeat/claim/submit)`.

---

## T4 — Scan routing (agentId) (TDD)
- [ ] **T4.1** — `RunScanInput`: add `agentId?: ID` (`@IsOptional @IsString`).
- [ ] **T4.2** — `scans.service.ts runScan`: if `input.agentId` provided, validate the agent (`findFirst { id: agentId, createdById: userId, status in [ACTIVE,IDLE] }` else `NotFoundError`/`ValidationError`); create the ScanJob with `agentId`; **skip** `scanQueue.add` (the agent will claim it). Keep the non-agent path unchanged. Update `scans.service.spec.ts`: agent-routed scan creates a job with `agentId` and does NOT enqueue; non-agent unchanged.
- [ ] **T4.3** — Verify `test -p api-gateway`. Commit: `feat(phase-5.4): route ScanJob to agent when agentId set (skip scan-jobs queue)`.

---

## T5 — CLI `agent` commands
- [ ] **T5.1** — `apps/cli/src/lib/agent-store.ts`: persist `{ agentId, privateKeyBase64, apiUrl }` to a local file (mirror `ConfigStore`).
- [ ] **T5.2** — `apps/cli/src/commands/agent.ts`:
  - `register`: args `--api-url`, `--token <bootstrap>`, `--name? ` ; generate keypair (`generateAgentKeypair` from `@autoscanner/common`), POST `/agents/enroll` `{ bootstrapToken, publicKey, capabilities: {os:process.platform, arch:process.arch, tools:[]} , hostname: os.hostname() }`; on success store agentId+privkey; print agentId.
  - `run`: loop every N seconds: build canonical heartbeat string, sign, POST `/agents/heartbeat`; then POST `/agents/jobs/claim` (signed); if a job returned, run the scanner LOCALLY (v1: shell out to the tool named by `scannerName` with `target`, capture stdout; if the tool is missing, submit exitCode=127 + the error text as raw output), then POST `/agents/jobs/:id/result` (signed) with `rawOutputBase64`. Use `--once` flag to run a single iteration (for tests/e2e).
  - `list`: GraphQL `agents` query (operator-auth via the normal login token) → print rows.
- [ ] **T5.3** — Add agent REST helpers to `apps/cli/src/lib/api-client.ts` (plain `fetch` for the signed REST calls; GraphQL for `list`). Wire commands into `main.ts`.
- [ ] **T5.4** — Unit-test the canonical-string construction + the register flow with a mocked fetch (mirror existing CLI command tests if any; otherwise a focused test of the signing/canonical helpers). Verify `type-check,test -p cli`. Commit: `feat(phase-5.4): CLI agent register/run/list`.

---

## T6 — Frontend Agents panel (TDD)
- [ ] **T6.1** — GraphQL docs: `AGENTS_QUERY`, `CREATE_AGENT_REGISTRATION_MUTATION` (returns `{ agentId bootstrapToken }`), `REVOKE_AGENT_MUTATION`.
- [ ] **T6.2** — `apps/frontend/src/features/agents/agents-panel.tsx`: list agents (name, status, lastHeartbeatAt); a "Enrol agent" form (name) that calls createAgentRegistration and shows the returned `bootstrapToken` ONCE in a copyable block with a warning; a Revoke button per agent. Errors via `role="alert"`. Wire into settings page.
- [ ] **T6.3** — Vitest test: renders agents; enrol shows the bootstrap token; revoke fires the mutation. Verify `type-check,test -p frontend`. Commit: `feat(phase-5.4): agents UI (enrol + list + revoke)`.

---

## T7 — e2e + validation
- [ ] **T7.1** — `apps/api-gateway-e2e/src/scenarios/agents-e2e.spec.ts` gated `AGENT_E2E=1` (mirror scheduler-graphql-e2e gating). Scenario (no live worker needed for asserts): operator `createAgentRegistration` → enroll via REST with a generated keypair → heartbeat (signed) → create an agent-routed scan (runScan with agentId, scanner that needs no live tool e.g. a stub) → claim via REST → submit a fake result → assert the ScanJob is COMPLETED with a rawOutputKey. If a real scanner/parse is too heavy, assert through claim+submit and that job status transitions. Type-check only (stays skipped).
- [ ] **T7.2** — Full validation: `pnpm nx run-many -t type-check,test -p common,queues,api-gateway,cli,frontend` + e2e tsc. All green.
- [ ] **T7.3** — Add `.env`/docs note if needed; commit remaining. Ready to merge.

---

## Validation criteria (spec §5.4)
- Unit: `claimJob` returns an agent-routed pending job + sets agentId/RUNNING (T3). Signature verify rejects tampering (T2/T3).
- e2e `AGENT_E2E`: enrol → claim → submit → persist (T7).

## Out of scope (v1)
- Real cross-compiled agent binary (Node CLI only).
- Nonce-based replay store (ts-freshness window only).
- Capability-based auto-routing (operator explicitly picks `agentId`; capability match is advisory).
- Orphan-job sweeper for agents that crash mid-job (existing scan-worker reconcile not extended to agentId in v1).
- WS long-poll for claim (simple REST poll loop in v1).

## Self-review notes
- Signed canonical strings are explicit per endpoint (heartbeat `agentId|ts`, claim `claim|agentId|ts`, result `result|jobId|agentId|ts`) — client + server build identically. ts-freshness ±120s.
- `publicKey`/`registrationToken` never exposed in `AgentObject`. bootstrapToken returned exactly once (createRegistration).
- Routing: agent jobs are NOT enqueued to scan-jobs; claimed via REST; results re-enter the parse pipeline.
