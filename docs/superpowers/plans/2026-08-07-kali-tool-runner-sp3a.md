# Kali Tool Runner — SP3a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the event-driven backend to run an arbitrary Kali tool command in an ephemeral `kali-toolbox` container, parse its output generically by format, persist a `KaliToolRun`, and stream live progress over a GraphQL subscription. No UI (that is SP3b).

**Architecture:** `runKaliTool` mutation creates a `KaliToolRun` (PENDING) and publishes `security.kalitool.requested`. A new `kali-tool-worker` app hosts two Kafka consumers: **run** (docker-run the argv in `kali-toolbox`, capture → MinIO, publish `security.kalitool.parse.requested`) and **parse+persist** (read raw from MinIO, `parseToolOutput`, write `outputFormat`+`parsedJson`, COMPLETED). Each transition publishes a Redis event to `kalitool:events:<runId>`; api-gateway's `kaliToolRunEvents` subscription streams it. Mirrors the existing `scan-worker → parser-worker` + `AiRunEvents` patterns.

**Tech Stack:** NestJS 11, Prisma 6 (Postgres), Kafka (Redpanda) via `@autoscanner/messaging`, `libs/docker-runner`, `@autoscanner/storage` (MinIO), ioredis pub/sub, `@nestjs/graphql` code-first, Jest.

**Repo policy note:** default branch is `main`; create a feature branch before the first commit (`git checkout -b feat/kali-tool-runner-sp3a`). Do not push without the user's consent. The pre-commit lint-staged hook (prettier/eslint) runs on each commit — let it.

**Spec:** `docs/superpowers/specs/2026-08-07-kali-tool-runner-sp3a-design.md`

**Prerequisite context (read before starting):** the patterns this plan clones —
`apps/scan-worker/src/app/scan-job.processor.ts` (consumer + docker-runner + MinIO + publish-next),
`apps/scan-worker/src/app/app.module.ts` + `apps/scan-worker/src/main.ts` (worker bootstrap),
`apps/ai-orchestrator-worker/src/app/ai-run-events.publisher.ts` and
`apps/api-gateway/src/app/ai-runs/ai-run-events.subscriber.ts` + `ai-runs.resolver.ts` (Redis pub/sub
subscription), `apps/api-gateway/src/app/scans/scans.service.ts` (mutation create + `bus.publish`).

---

## Key APIs (verified in code — use these exact shapes)

- **Docker**: `@Inject(DOCKER_RUNNER) docker: DockerRunner` from `@autoscanner/docker-runner`.
  `docker.pullIfMissing(image)`, `docker.run(spec: RunSpec): Promise<RunResult>`.
  `RunSpec = { image, cmd: string[], env?, binds?, network, capabilities?: {add,drop}, readonlyRootfs?, memoryLimitMb?, cpuQuota?, timeoutMs, user?, onStdout?, onStderr?, abortSignal? }`.
  **`run` REQUIRES at least one of `onStdout`/`onStderr`.** `RunResult = { exitCode, durationMs, containerId, timedOut, killedByUser }`.
- **Messaging**: `extends MessageConsumer<P>` with `readonly topic`, `onApplicationBootstrap(){ await this.registrar.register(this) }`; `@Inject(JOB_BUS) bus: JobBus` → `bus.publish<P>(TOPIC, key, payload)`; handler `process(ctx: MessageContext<P>)`, `ctx.payload`. All from `@autoscanner/messaging`.
- **Storage**: `@Inject(OBJECT_STORAGE) storage: ObjectStorage` from `@autoscanner/storage`. `storage.ensureBucket('raw-outputs')`, `storage.putObject({bucket,key,body,contentType})`, `storage.getObject(bucket,key): Promise<GetObjectResult>`.
- **Redis events publisher** (worker): a plain `IORedis` client, `redis.publish(channel, JSON.stringify(event))` (best-effort, never throws) — see `AiRunEventsPublisher`.

---

## File Structure

- `prisma/schema.prisma` — add `KaliToolRun` model + `KaliToolRunStatus` enum + back-relations (modify).
- `libs/messaging/src/topics.ts` (+ `topics.spec.ts`) — add 2 topics (modify).
- `libs/queues/src/*` — add `KaliToolRunPayload` / `KaliToolParsePayload` payload types (modify; mirror `ScanJobPayload`).
- `apps/kali-tool-worker/` — new Nx app (project.json, tsconfig*, src/main.ts, src/app/app.module.ts).
- `apps/kali-tool-worker/src/app/parse/parse-tool-output.ts` (+ test) — pure generic parser.
- `apps/kali-tool-worker/src/app/kali-toolbox.ts` — the fixed `kali-toolbox` RunSpec + raw key helper.
- `apps/kali-tool-worker/src/app/kali-run.processor.ts` (+ test) — run consumer.
- `apps/kali-tool-worker/src/app/kali-parse.processor.ts` (+ test) — parse+persist consumer.
- `apps/kali-tool-worker/src/app/kali-tool-run-events.publisher.ts` — Redis events publisher (port).
- `apps/api-gateway/src/app/kali-runs/` — module, DTOs, service (mutation+queries+validation), resolver, subscription subscriber (ports), tests.
- `tools/scanners/build-images.sh` — add the `kali-toolbox` build (modify).
- `apps/kali-tool-worker/README.md` — run docs.

---

## Task 1: Prisma model + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Migration: generated under `prisma/migrations/`

- [ ] **Step 1: Add the enum + model** — append to `prisma/schema.prisma`:

```prisma
enum KaliToolRunStatus {
  PENDING
  RUNNING
  PARSING
  COMPLETED
  FAILED
}

model KaliToolRun {
  id            String            @id @default(cuid())
  engagementId  String
  createdById   String
  binary        String
  argsJson      Json
  target        String?
  jsonRequested Boolean           @default(false)
  status        KaliToolRunStatus @default(PENDING)
  rawOutputRef  String?
  outputFormat  String?
  exitCode      Int?
  parsedJson    Json?
  errorMessage  String?
  startedAt     DateTime?
  completedAt   DateTime?
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt

  engagement Engagement @relation(fields: [engagementId], references: [id], onDelete: Cascade)
  createdBy  User       @relation(fields: [createdById], references: [id])

  @@index([engagementId])
}
```

- [ ] **Step 2: Add back-relations** — in the `Engagement` model add `kaliToolRuns KaliToolRun[]`, and in the `User` model add `kaliToolRuns KaliToolRun[]`. (Find each model block; add the relation field alongside the other relations.)

- [ ] **Step 3: Create + apply the migration** (requires infra up: `pnpm dev:up`)

Run: `pnpm prisma migrate dev --name kali_tool_run`
Expected: a new migration folder is created and applied; `prisma generate` runs (the `KaliToolRun` client type becomes available).

- [ ] **Step 4: Verify the client type exists**

Run: `node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();console.log(typeof p.kaliToolRun.create)"`
Expected: prints `function`.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(kali-runner): KaliToolRun model + migration"
```

---

## Task 2: Kafka topics

**Files:**
- Modify: `libs/messaging/src/topics.ts`
- Modify: `libs/messaging/src/topics.spec.ts`

- [ ] **Step 1: Add a failing expectation** — in `libs/messaging/src/topics.spec.ts`, add the two topic names to the array/set the test asserts (mirror the existing entries):

```ts
'security.kalitool.requested',
'security.kalitool.parse.requested',
```

- [ ] **Step 2: Run to confirm it fails**

Run: `pnpm nx test messaging --testFile=topics.spec.ts`
Expected: FAIL — the registry is missing the two topics.

- [ ] **Step 3: Register the topics** — in `libs/messaging/src/topics.ts`, add to the registry object (mirror the existing `{ partitions, group }` shape), after the `security.ai.run.requested` line:

```ts
  'security.kalitool.requested': { partitions: 3, group: 'kali-tool-run' },
  'security.kalitool.parse.requested': { partitions: 3, group: 'kali-tool-parse' },
```

- [ ] **Step 4: Run to confirm it passes**

Run: `pnpm nx test messaging --testFile=topics.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/messaging/src/topics.ts libs/messaging/src/topics.spec.ts
git commit -m "feat(kali-runner): kalitool Kafka topics (run + parse)"
```

---

## Task 3: Payload types

**Files:**
- Modify: `libs/queues/src/` (the file that exports `ScanJobPayload` / `ParseJobPayload` — find it with a grep for `ScanJobPayload`)

- [ ] **Step 1: Add the payload interfaces** next to the existing ones:

```ts
export interface KaliToolRunPayload {
  runId: string;
}

export interface KaliToolParsePayload {
  runId: string;
  rawOutputKey: string;
}
```

Ensure they are re-exported from the lib's `index.ts` the same way `ScanJobPayload` is.

- [ ] **Step 2: Type-check the lib**

Run: `pnpm nx type-check queues`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add libs/queues/src
git commit -m "feat(kali-runner): KaliToolRun/Parse Kafka payload types"
```

---

## Task 4: Generic output parser (pure)

**Files:**
- Create: `apps/kali-tool-worker/src/app/parse/parse-tool-output.ts`
- Test: `apps/kali-tool-worker/src/app/parse/__tests__/parse-tool-output.spec.ts`

> Note: the `kali-tool-worker` app is scaffolded in Task 5, but this pure module + its jest test can be authored now; run its test after Task 5 wires the jest config. If you prefer, do Task 5 first, then this. Either order is fine as long as the parser test is green before Task 7.

- [ ] **Step 1: Write the failing test**

```ts
// apps/kali-tool-worker/src/app/parse/__tests__/parse-tool-output.spec.ts
import { parseToolOutput } from '../parse-tool-output';

describe('parseToolOutput', () => {
  it('parses a JSON object', () => {
    const r = parseToolOutput('{"a":1,"b":[2,3]}');
    expect(r.format).toBe('json');
    expect(r.view).toEqual({ a: 1, b: [2, 3] });
  });

  it('parses a JSON array even with surrounding whitespace', () => {
    expect(parseToolOutput('\n  [1,2,3]  ').format).toBe('json');
  });

  it('detects a whitespace-aligned table', () => {
    const raw = ['PORT     STATE  SERVICE', '22/tcp   open   ssh', '80/tcp   open   http'].join('\n');
    const r = parseToolOutput(raw);
    expect(r.format).toBe('table');
    expect(r.view).toEqual({
      headers: ['PORT', 'STATE', 'SERVICE'],
      rows: [
        ['22/tcp', 'open', 'ssh'],
        ['80/tcp', 'open', 'http'],
      ],
    });
  });

  it('detects key: value blocks', () => {
    const raw = ['Host: example.com', 'Status: up', 'Ports: 3'].join('\n');
    const r = parseToolOutput(raw);
    expect(r.format).toBe('keyvalue');
    expect(r.view).toEqual({
      pairs: [
        { key: 'Host', value: 'example.com' },
        { key: 'Status', value: 'up' },
        { key: 'Ports', value: '3' },
      ],
    });
  });

  it('strips ANSI and falls back to clean text', () => {
    const raw = '[31mred line[0m\nplain line';
    const r = parseToolOutput(raw);
    expect(r.format).toBe('text');
    expect(r.view).toEqual({ lines: ['red line', 'plain line'] });
  });

  it('returns empty text for blank input', () => {
    expect(parseToolOutput('   ')).toEqual({ format: 'text', view: { lines: [] } });
  });
});
```

- [ ] **Step 2: Run to confirm it fails** (after Task 5 scaffolds the app)

Run: `pnpm nx test kali-tool-worker --testFile=parse-tool-output.spec.ts`
Expected: FAIL — `Cannot find module '../parse-tool-output'`.

- [ ] **Step 3: Implement the parser**

```ts
// apps/kali-tool-worker/src/app/parse/parse-tool-output.ts
export type ToolOutputFormat = 'json' | 'table' | 'keyvalue' | 'text';

export interface ParsedToolOutput {
  format: ToolOutputFormat;
  view: unknown;
}

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\[[0-9;]*m/g;

export function parseToolOutput(raw: string): ParsedToolOutput {
  const clean = (raw ?? '').replace(ANSI_RE, '');
  const trimmed = clean.trim();
  if (!trimmed) return { format: 'text', view: { lines: [] } };

  // JSON first (object or array).
  if (trimmed[0] === '{' || trimmed[0] === '[') {
    try {
      return { format: 'json', view: JSON.parse(trimmed) };
    } catch {
      /* not JSON — fall through */
    }
  }

  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);

  // Table: >=2 lines that split into the same column count on runs of 2+ spaces.
  if (lines.length >= 2) {
    const split = (l: string) => l.trim().split(/\s{2,}/);
    const cols = split(lines[0]);
    if (cols.length >= 2 && lines.every((l) => split(l).length === cols.length)) {
      return {
        format: 'table',
        view: { headers: cols, rows: lines.slice(1).map(split) },
      };
    }
  }

  // Key: value: majority of lines match "Key: value".
  const kvRe = /^([A-Za-z][\w .-]*?):\s+(.+)$/;
  const kv = lines.map((l) => l.match(kvRe)).filter(Boolean) as RegExpMatchArray[];
  if (lines.length > 0 && kv.length >= Math.ceil(lines.length / 2) && kv.length >= 2) {
    return {
      format: 'keyvalue',
      view: { pairs: kv.map((m) => ({ key: m[1].trim(), value: m[2].trim() })) },
    };
  }

  return { format: 'text', view: { lines: lines.map((l) => l.trim()) } };
}
```

- [ ] **Step 4: Run to confirm it passes**

Run: `pnpm nx test kali-tool-worker --testFile=parse-tool-output.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/kali-tool-worker/src/app/parse
git commit -m "feat(kali-runner): generic by-format output parser"
```

---

## Task 5: Scaffold the `kali-tool-worker` app

**Files:**
- Create: `apps/kali-tool-worker/project.json`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.spec.json`, `jest.config.ts`, `src/main.ts`, `src/app/app.module.ts`

Mirror `apps/scan-worker` exactly (copy its `project.json`, tsconfig files, and `jest.config.ts`, changing the project name/paths from `scan-worker` to `kali-tool-worker`). Read those files first.

- [ ] **Step 1: Copy scaffolding from scan-worker** — replicate `apps/scan-worker/{project.json,tsconfig.json,tsconfig.app.json,tsconfig.spec.json,jest.config.ts}` into `apps/kali-tool-worker/`, replacing every `scan-worker` occurrence with `kali-tool-worker` and fixing `sourceRoot`/`outputPath`/coverage paths accordingly.

- [ ] **Step 2: main.ts** — mirror `apps/scan-worker/src/main.ts` (bootstraps `AppModule` as a standalone Nest application context; no HTTP server). Copy it verbatim, swapping the imported `AppModule` path if needed (same relative path `./app/app.module`).

- [ ] **Step 3: app.module.ts** (minimal for now — processors added in Tasks 7–8)

```ts
// apps/kali-tool-worker/src/app/app.module.ts
import { Module, type Provider } from '@nestjs/common';
import IORedis from 'ioredis';

import { AppConfigModule, AppConfigService } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { PrismaModule } from '@autoscanner/database';
import { DockerRunnerModule } from '@autoscanner/docker-runner';
import { StorageModule } from '@autoscanner/storage';
import { MessagingModule } from '@autoscanner/messaging';

import {
  KaliToolRunEventsPublisher,
  KALI_TOOL_RUN_EVENTS_REDIS,
} from './kali-tool-run-events.publisher';

const eventsRedisProvider: Provider = {
  provide: KALI_TOOL_RUN_EVENTS_REDIS,
  inject: [AppConfigService],
  useFactory: (cfg: AppConfigService) => new IORedis(cfg.env.REDIS_URL, { lazyConnect: false }),
};

@Module({
  imports: [
    AppConfigModule,
    AppLoggingModule,
    PrismaModule,
    DockerRunnerModule,
    StorageModule,
    MessagingModule.forRoot(),
  ],
  providers: [eventsRedisProvider, KaliToolRunEventsPublisher],
})
export class AppModule {}
```

> The allowlist (binary must exist in the SP1 dataset) is enforced at the mutation (Task 9). A worker
> re-check is optional defense-in-depth and is **out of scope for SP3a** — the module above
> deliberately does not import any catalog source. Add it later if desired.

- [ ] **Step 4: Register in the workspace** — ensure `apps/kali-tool-worker` is picked up by Nx (Nx auto-detects `project.json`). Verify:

Run: `pnpm nx show project kali-tool-worker`
Expected: prints the project config (targets: build, serve, test, ...).

- [ ] **Step 5: Add a dev script** — in root `package.json` scripts, after `dev:orchestrator-worker`, add:

```json
    "dev:kali-tool-worker": "nx serve kali-tool-worker",
```

- [ ] **Step 6: Build to verify the app compiles** (with the minimal module)

Run: `pnpm nx build kali-tool-worker`
Expected: builds (the events publisher is created in Task 6 — if build runs before Task 6, temporarily stub the import; prefer doing Task 6 before this build check).

- [ ] **Step 7: Commit**

```bash
git add apps/kali-tool-worker package.json
git commit -m "feat(kali-runner): scaffold kali-tool-worker app"
```

---

## Task 6: Redis events publisher (worker) + subscriber (api-gateway)

**Files:**
- Create: `apps/kali-tool-worker/src/app/kali-tool-run-events.publisher.ts`
- Create: `apps/api-gateway/src/app/kali-runs/kali-tool-run-events.subscriber.ts`
- Test: `apps/api-gateway/src/app/kali-runs/__tests__/kali-tool-run-events.subscriber.spec.ts`

Port `AiRunEventsPublisher` and `AiRunEventsSubscriber` verbatim, renaming symbols and the channel.

- [ ] **Step 1: Publisher** — copy `apps/ai-orchestrator-worker/src/app/ai-run-events.publisher.ts`, rename class → `KaliToolRunEventsPublisher`, token → `KALI_TOOL_RUN_EVENTS_REDIS`, channel fn → `kaliToolRunEventsChannel(runId) => \`kalitool:events:${runId}\``, and `publish(runId, event)`.

- [ ] **Step 2: Subscriber test** — copy `apps/api-gateway/src/app/ai-runs/__tests__/ai-run-events.subscriber.spec.ts`, adapting names/channel to the Kali subscriber. Run it to confirm it fails (module missing).

Run: `pnpm nx test api-gateway --testFile=kali-tool-run-events.subscriber.spec.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Subscriber** — copy `apps/api-gateway/src/app/ai-runs/ai-run-events.subscriber.ts`, rename class → `KaliToolRunEventsSubscriber`, token → `KALI_TOOL_RUN_EVENTS_SUBSCRIBER`, channel fn → `kaliToolRunEventsChannel`, and the message type → `KaliToolRunEventMessage { type: string; [k: string]: unknown }`.

- [ ] **Step 4: Run to confirm it passes**

Run: `pnpm nx test api-gateway --testFile=kali-tool-run-events.subscriber.spec.ts`
Expected: PASS (same case count as the ported ai-run spec).

- [ ] **Step 5: Commit**

```bash
git add apps/kali-tool-worker/src/app/kali-tool-run-events.publisher.ts apps/api-gateway/src/app/kali-runs/kali-tool-run-events.subscriber.ts apps/api-gateway/src/app/kali-runs/__tests__/kali-tool-run-events.subscriber.spec.ts
git commit -m "feat(kali-runner): kaliToolRunEvents publisher + subscriber (ports)"
```

---

## Task 7: Run consumer (`kali-run.processor.ts`)

**Files:**
- Create: `apps/kali-tool-worker/src/app/kali-toolbox.ts`
- Create: `apps/kali-tool-worker/src/app/kali-run.processor.ts`
- Test: `apps/kali-tool-worker/src/app/__tests__/kali-run.processor.spec.ts`
- Modify: `apps/kali-tool-worker/src/app/app.module.ts` (register the processor)

- [ ] **Step 1: The kali-toolbox spec + raw key helper**

```ts
// apps/kali-tool-worker/src/app/kali-toolbox.ts
import type { RunSpec } from '@autoscanner/docker-runner';

export const KALI_TOOLBOX_IMAGE = 'autoscanner/kali-toolbox:1.0';
export const KALI_TOOLBOX_MEMORY_MB = 2048;
export const KALI_TOOLBOX_TIMEOUT_MS = 15 * 60 * 1000;
export const KALI_MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

/** MinIO object key for a Kali tool run's captured output. */
export function kaliRawKey(engagementId: string, runId: string): string {
  return `kali/${engagementId}/${runId}.out`;
}

/** Base sandbox spec for a kali-toolbox run (argv supplied by the caller). */
export function kaliToolboxRunSpec(argv: string[]): Omit<RunSpec, 'onStdout' | 'onStderr'> {
  return {
    image: KALI_TOOLBOX_IMAGE,
    cmd: argv, // argv only — never a shell string
    network: 'bridge',
    capabilities: { add: [], drop: ['ALL'] },
    readonlyRootfs: true,
    memoryLimitMb: KALI_TOOLBOX_MEMORY_MB,
    timeoutMs: KALI_TOOLBOX_TIMEOUT_MS,
  };
}
```

- [ ] **Step 2: Write the failing consumer test** (mocks docker-runner, storage, bus, publisher, prisma)

```ts
// apps/kali-tool-worker/src/app/__tests__/kali-run.processor.spec.ts
import { KaliRunProcessor } from '../kali-run.processor';

function makeDeps() {
  const run = {
    id: 'r1', engagementId: 'e1', binary: 'nmap',
    argsJson: ['-sV', 'scanme.example.com'], status: 'PENDING',
  };
  const prisma = {
    kaliToolRun: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(run),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const docker = {
    pullIfMissing: jest.fn().mockResolvedValue(undefined),
    run: jest.fn().mockImplementation(async (spec: any) => {
      spec.onStdout?.('{"host":"up"}');
      return { exitCode: 0, durationMs: 5, containerId: 'c', timedOut: false, killedByUser: false };
    }),
  };
  const storage = { ensureBucket: jest.fn().mockResolvedValue(undefined), putObject: jest.fn().mockResolvedValue({}) };
  const bus = { publish: jest.fn().mockResolvedValue(undefined) };
  const events = { publish: jest.fn().mockResolvedValue(undefined) };
  const registrar = { register: jest.fn().mockResolvedValue(undefined) };
  return { prisma, docker, storage, bus, events, registrar, run };
}

describe('KaliRunProcessor', () => {
  it('runs argv in kali-toolbox, stores output, publishes parse', async () => {
    const d = makeDeps();
    const p = new KaliRunProcessor(d.prisma as any, d.docker as any, d.storage as any, d.bus as any, d.registrar as any, d.events as any);
    await p.process({ payload: { runId: 'r1' } } as any);

    // argv passed verbatim (no shell), correct image
    expect(d.docker.run).toHaveBeenCalledWith(
      expect.objectContaining({ image: 'autoscanner/kali-toolbox:1.0', cmd: ['nmap', '-sV', 'scanme.example.com'] }),
    );
    // stored to raw-outputs
    expect(d.storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({ bucket: 'raw-outputs', key: 'kali/e1/r1.out' }),
    );
    // published parse with the key
    expect(d.bus.publish).toHaveBeenCalledWith(
      'security.kalitool.parse.requested', 'r1',
      expect.objectContaining({ runId: 'r1', rawOutputKey: 'kali/e1/r1.out' }),
    );
    // status ended RUNNING (parse consumer flips to COMPLETED)
    expect(d.prisma.kaliToolRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'r1' }, data: expect.objectContaining({ status: 'RUNNING' }) }),
    );
  });

  it('is a no-op for an already-terminal run (redelivery)', async () => {
    const d = makeDeps();
    d.prisma.kaliToolRun.findUniqueOrThrow.mockResolvedValue({ ...d.run, status: 'COMPLETED' });
    const p = new KaliRunProcessor(d.prisma as any, d.docker as any, d.storage as any, d.bus as any, d.registrar as any, d.events as any);
    await p.process({ payload: { runId: 'r1' } } as any);
    expect(d.docker.run).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run to confirm it fails**

Run: `pnpm nx test kali-tool-worker --testFile=kali-run.processor.spec.ts`
Expected: FAIL — `Cannot find module '../kali-run.processor'`.

- [ ] **Step 4: Implement the run consumer** (clone the shape of `ScanJobProcessor`)

```ts
// apps/kali-tool-worker/src/app/kali-run.processor.ts
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import { DOCKER_RUNNER, type DockerRunner } from '@autoscanner/docker-runner';
import { OBJECT_STORAGE, type ObjectStorage } from '@autoscanner/storage';
import {
  ConsumerRegistrar,
  JOB_BUS,
  MessageConsumer,
  type JobBus,
  type MessageContext,
} from '@autoscanner/messaging';
import type { KaliToolParsePayload, KaliToolRunPayload } from '@autoscanner/queues';
import { KaliToolRunEventsPublisher } from './kali-tool-run-events.publisher';
import {
  KALI_MAX_OUTPUT_BYTES,
  KALI_TOOLBOX_IMAGE,
  kaliRawKey,
  kaliToolboxRunSpec,
} from './kali-toolbox';

const RUN_TOPIC = 'security.kalitool.requested';
const PARSE_TOPIC = 'security.kalitool.parse.requested';
const TERMINAL = new Set(['COMPLETED', 'FAILED']);

@Injectable()
export class KaliRunProcessor
  extends MessageConsumer<KaliToolRunPayload>
  implements OnApplicationBootstrap
{
  readonly topic = RUN_TOPIC;
  private readonly logger = new Logger(KaliRunProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(DOCKER_RUNNER) private readonly docker: DockerRunner,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(JOB_BUS) private readonly bus: JobBus,
    @Inject(ConsumerRegistrar) private readonly registrar: ConsumerRegistrar,
    private readonly events: KaliToolRunEventsPublisher,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.registrar.register(this);
  }

  async process(ctx: MessageContext<KaliToolRunPayload>): Promise<void> {
    const { runId } = ctx.payload;
    const run = await this.prisma.kaliToolRun.findUniqueOrThrow({ where: { id: runId } });
    if (TERMINAL.has(run.status)) {
      this.logger.log(`kaliToolRun=${runId} already ${run.status} — skip`);
      return;
    }

    const args = Array.isArray(run.argsJson) ? (run.argsJson as string[]) : [];
    const argv = [run.binary, ...args];

    await this.prisma.kaliToolRun.update({
      where: { id: runId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });
    await this.events.publish(runId, { type: 'status', status: 'RUNNING' });

    const key = kaliRawKey(run.engagementId, runId);
    const chunks: string[] = [];
    let bytes = 0;
    let oversized = false;
    const capture = (c: string) => {
      if (oversized) return;
      const b = Buffer.byteLength(c, 'utf8');
      if (bytes + b > KALI_MAX_OUTPUT_BYTES) { oversized = true; return; }
      chunks.push(c);
      bytes += b;
    };

    try {
      await this.docker.pullIfMissing(KALI_TOOLBOX_IMAGE);
      const result = await this.docker.run({
        ...kaliToolboxRunSpec(argv),
        onStdout: capture,
        onStderr: capture,
      });

      await this.storage.ensureBucket('raw-outputs');
      await this.storage.putObject({
        bucket: 'raw-outputs',
        key,
        body: Buffer.from(chunks.join(''), 'utf8'),
        contentType: 'application/octet-stream',
      });

      await this.prisma.kaliToolRun.update({
        where: { id: runId },
        data: { exitCode: result.exitCode, rawOutputRef: key },
      });

      await this.bus.publish<KaliToolParsePayload>(PARSE_TOPIC, runId, { runId, rawOutputKey: key });
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`kaliToolRun=${runId} failed: ${message}`);
      await this.prisma.kaliToolRun.update({
        where: { id: runId },
        data: { status: 'FAILED', completedAt: new Date(), errorMessage: message },
      });
      await this.events.publish(runId, { type: 'error', message });
      throw err;
    }
  }
}
```

- [ ] **Step 5: Register it** — in `apps/kali-tool-worker/src/app/app.module.ts`, add `KaliRunProcessor` to `providers`.

- [ ] **Step 6: Run to confirm it passes**

Run: `pnpm nx test kali-tool-worker --testFile=kali-run.processor.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/kali-tool-worker/src/app/kali-toolbox.ts apps/kali-tool-worker/src/app/kali-run.processor.ts apps/kali-tool-worker/src/app/__tests__/kali-run.processor.spec.ts apps/kali-tool-worker/src/app/app.module.ts
git commit -m "feat(kali-runner): run consumer (kali-toolbox exec + capture)"
```

---

## Task 8: Parse+persist consumer (`kali-parse.processor.ts`)

**Files:**
- Create: `apps/kali-tool-worker/src/app/kali-parse.processor.ts`
- Test: `apps/kali-tool-worker/src/app/__tests__/kali-parse.processor.spec.ts`
- Modify: `apps/kali-tool-worker/src/app/app.module.ts` (register)

- [ ] **Step 1: Write the failing test**

```ts
// apps/kali-tool-worker/src/app/__tests__/kali-parse.processor.spec.ts
import { KaliParseProcessor } from '../kali-parse.processor';

function deps(status = 'RUNNING') {
  const prisma = {
    kaliToolRun: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'r1', status }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const storage = {
    getObject: jest.fn().mockResolvedValue({ body: Buffer.from('{"host":"up"}', 'utf8') }),
  };
  const events = { publish: jest.fn().mockResolvedValue(undefined) };
  const registrar = { register: jest.fn().mockResolvedValue(undefined) };
  return { prisma, storage, events, registrar };
}

describe('KaliParseProcessor', () => {
  it('parses JSON output and persists COMPLETED', async () => {
    const d = deps();
    const p = new KaliParseProcessor(d.prisma as any, d.storage as any, d.registrar as any, d.events as any);
    await p.process({ payload: { runId: 'r1', rawOutputKey: 'kali/e1/r1.out' } } as any);

    expect(d.storage.getObject).toHaveBeenCalledWith('raw-outputs', 'kali/e1/r1.out');
    expect(d.prisma.kaliToolRun.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'r1' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          outputFormat: 'json',
          parsedJson: { format: 'json', view: { host: 'up' } },
        }),
      }),
    );
    expect(d.events.publish).toHaveBeenLastCalledWith('r1', { type: 'status', status: 'COMPLETED' });
  });

  it('is a no-op if already COMPLETED (redelivery)', async () => {
    const d = deps('COMPLETED');
    const p = new KaliParseProcessor(d.prisma as any, d.storage as any, d.registrar as any, d.events as any);
    await p.process({ payload: { runId: 'r1', rawOutputKey: 'k' } } as any);
    expect(d.storage.getObject).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `pnpm nx test kali-tool-worker --testFile=kali-parse.processor.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement it**

```ts
// apps/kali-tool-worker/src/app/kali-parse.processor.ts
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import { OBJECT_STORAGE, type ObjectStorage } from '@autoscanner/storage';
import {
  ConsumerRegistrar,
  MessageConsumer,
  type MessageContext,
} from '@autoscanner/messaging';
import type { KaliToolParsePayload } from '@autoscanner/queues';
import { KaliToolRunEventsPublisher } from './kali-tool-run-events.publisher';
import { parseToolOutput } from './parse/parse-tool-output';

const PARSE_TOPIC = 'security.kalitool.parse.requested';
const TERMINAL = new Set(['COMPLETED', 'FAILED']);

@Injectable()
export class KaliParseProcessor
  extends MessageConsumer<KaliToolParsePayload>
  implements OnApplicationBootstrap
{
  readonly topic = PARSE_TOPIC;
  private readonly logger = new Logger(KaliParseProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(ConsumerRegistrar) private readonly registrar: ConsumerRegistrar,
    private readonly events: KaliToolRunEventsPublisher,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.registrar.register(this);
  }

  async process(ctx: MessageContext<KaliToolParsePayload>): Promise<void> {
    const { runId, rawOutputKey } = ctx.payload;
    const run = await this.prisma.kaliToolRun.findUniqueOrThrow({ where: { id: runId } });
    if (TERMINAL.has(run.status)) {
      this.logger.log(`kaliToolRun=${runId} already ${run.status} — skip parse`);
      return;
    }

    await this.prisma.kaliToolRun.update({ where: { id: runId }, data: { status: 'PARSING' } });
    await this.events.publish(runId, { type: 'status', status: 'PARSING' });

    try {
      const obj = await this.storage.getObject('raw-outputs', rawOutputKey);
      const raw = Buffer.isBuffer(obj.body) ? obj.body.toString('utf8') : String(obj.body ?? '');
      const parsed = parseToolOutput(raw);

      await this.prisma.kaliToolRun.update({
        where: { id: runId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          outputFormat: parsed.format,
          parsedJson: parsed as unknown as object,
        },
      });
      await this.events.publish(runId, { type: 'status', status: 'COMPLETED' });
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`kaliToolRun=${runId} parse failed: ${message}`);
      await this.prisma.kaliToolRun.update({
        where: { id: runId },
        data: { status: 'FAILED', completedAt: new Date(), errorMessage: message },
      });
      await this.events.publish(runId, { type: 'error', message });
      throw err;
    }
  }
}
```

- [ ] **Step 4: Register it** — add `KaliParseProcessor` to `app.module.ts` providers.

- [ ] **Step 5: Run to confirm it passes**

Run: `pnpm nx test kali-tool-worker --testFile=kali-parse.processor.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/kali-tool-worker/src/app/kali-parse.processor.ts apps/kali-tool-worker/src/app/__tests__/kali-parse.processor.spec.ts apps/kali-tool-worker/src/app/app.module.ts
git commit -m "feat(kali-runner): parse+persist consumer"
```

---

## Task 9: API — validation helper, DTOs, service, mutation, queries

**Files:**
- Create: `apps/api-gateway/src/app/kali-runs/validate-kali-run.ts` (+ test)
- Create: `apps/api-gateway/src/app/kali-runs/dto/run-kali-tool.input.ts`
- Create: `apps/api-gateway/src/app/kali-runs/dto/kali-tool-run.object.ts`
- Create: `apps/api-gateway/src/app/kali-runs/kali-runs.service.ts` (+ test)

Reuse SP1's `KaliCatalogService` (allowlist) and `ContextBuilder`'s scope helper (`hostInScope`) — read
`apps/orchestrator-worker/src/app/context-builder.service.ts` for the `hostInScope`/`urlHost` shape.

- [ ] **Step 1: Validation helper test**

```ts
// apps/api-gateway/src/app/kali-runs/__tests__/validate-kali-run.spec.ts
import { looksLikeTarget, MAX_ARGS, MAX_ARG_LEN } from '../validate-kali-run';

describe('validate-kali-run', () => {
  it('flags host/ip/url args as targets', () => {
    expect(looksLikeTarget('scanme.example.com')).toBe(true);
    expect(looksLikeTarget('10.0.0.1')).toBe(true);
    expect(looksLikeTarget('https://x.example.com/a')).toBe(true);
    expect(looksLikeTarget('-sV')).toBe(false);
    expect(looksLikeTarget('top-100')).toBe(false);
  });
  it('exposes caps', () => {
    expect(MAX_ARGS).toBeGreaterThan(0);
    expect(MAX_ARG_LEN).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to confirm it fails**, then implement:

```ts
// apps/api-gateway/src/app/kali-runs/validate-kali-run.ts
export const MAX_ARGS = 40;
export const MAX_ARG_LEN = 2048;

const IPV4 = /^(\d{1,3})(\.\d{1,3}){3}(\/\d{1,2})?$/;
const HOSTISH = /^(?=.{1,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/i;

/** True if an arg looks like a scannable target (host, IP, or URL) and so must be scope-checked. */
export function looksLikeTarget(arg: string): boolean {
  const a = arg.trim();
  if (!a || a.startsWith('-')) return false;
  if (/^https?:\/\//i.test(a)) return true;
  if (IPV4.test(a)) return true;
  return HOSTISH.test(a);
}

/** Extract the host of a URL, else the arg itself (for scope checks). */
export function targetHost(arg: string): string {
  try {
    return new URL(arg).hostname.toLowerCase();
  } catch {
    return arg.toLowerCase();
  }
}
```

Run: `pnpm nx test api-gateway --testFile=validate-kali-run.spec.ts` → PASS.

- [ ] **Step 3: DTOs** (every field a class-validator decorator — repo invariant)

```ts
// apps/api-gateway/src/app/kali-runs/dto/run-kali-tool.input.ts
import { Field, ID, InputType } from '@nestjs/graphql';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

@InputType()
export class RunKaliToolInput {
  @Field(() => ID) @IsString() engagementId!: string;
  @Field() @IsString() binary!: string;
  @Field(() => [String]) @IsArray() @ArrayMaxSize(40) @IsString({ each: true }) @MaxLength(2048, { each: true })
  args!: string[];
  @Field({ nullable: true }) @IsOptional() @IsBoolean() jsonOutput?: boolean;
}
```

```ts
// apps/api-gateway/src/app/kali-runs/dto/kali-tool-run.object.ts
import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

@ObjectType()
export class KaliToolRunObject {
  @Field(() => ID) id!: string;
  @Field() engagementId!: string;
  @Field() binary!: string;
  @Field(() => [String]) args!: string[];
  @Field(() => String, { nullable: true }) target?: string | null;
  @Field() status!: string;
  @Field(() => String, { nullable: true }) outputFormat?: string | null;
  @Field(() => Int, { nullable: true }) exitCode?: number | null;
  @Field(() => GraphQLJSON, { nullable: true }) parsedJson?: unknown;
  @Field(() => String, { nullable: true }) errorMessage?: string | null;
  @Field(() => String, { nullable: true }) createdAt?: string | null;
}
```

- [ ] **Step 4: Service test** (allowlist reject + scope reject + happy path publishes)

```ts
// apps/api-gateway/src/app/kali-runs/__tests__/kali-runs.service.spec.ts
import { KaliRunsService } from '../kali-runs.service';

function svc(over: { known?: boolean; scopeRules?: any[] } = {}) {
  const prisma = {
    engagement: { findFirst: jest.fn().mockResolvedValue({ id: 'e1' }) },
    scopeRule: { findMany: jest.fn().mockResolvedValue(over.scopeRules ?? []) },
    kaliToolRun: { create: jest.fn().mockResolvedValue({ id: 'r1', engagementId: 'e1', binary: 'nmap', argsJson: [], status: 'PENDING' }) },
  };
  const kali = { findByBinary: jest.fn().mockReturnValue(over.known === false ? null : { binary: 'nmap' }) };
  const bus = { publish: jest.fn().mockResolvedValue(undefined) };
  return { s: new KaliRunsService(prisma as any, kali as any, bus as any), prisma, kali, bus };
}

describe('KaliRunsService.runKaliTool', () => {
  it('rejects an unknown binary', async () => {
    const { s } = svc({ known: false });
    await expect(s.runKaliTool('u1', { engagementId: 'e1', binary: 'evil', args: [] })).rejects.toThrow(/unknown|allow/i);
  });

  it('rejects an out-of-scope target arg', async () => {
    const { s } = svc({ scopeRules: [{ ruleType: 'INCLUDE', targetType: 'WILDCARD_DOMAIN', value: 'in.example.com' }] });
    await expect(
      s.runKaliTool('u1', { engagementId: 'e1', binary: 'nmap', args: ['-sV', 'evil.other.com'] }),
    ).rejects.toThrow(/scope/i);
  });

  it('creates the run and publishes requested', async () => {
    const { s, bus, prisma } = svc({ scopeRules: [{ ruleType: 'INCLUDE', targetType: 'WILDCARD_DOMAIN', value: 'example.com' }] });
    const run = await s.runKaliTool('u1', { engagementId: 'e1', binary: 'nmap', args: ['-sV', 'scanme.example.com'] });
    expect(prisma.kaliToolRun.create).toHaveBeenCalled();
    expect(bus.publish).toHaveBeenCalledWith('security.kalitool.requested', 'r1', { runId: 'r1' });
    expect(run.id).toBe('r1');
  });
});
```

- [ ] **Step 5: Run to confirm it fails**, then implement:

```ts
// apps/api-gateway/src/app/kali-runs/kali-runs.service.ts
import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import { JOB_BUS, type JobBus } from '@autoscanner/messaging';
import type { KaliToolRunPayload } from '@autoscanner/queues';

import { KaliCatalogService } from '../tools/kali-catalog.service';
import type { RunKaliToolInput } from './dto/run-kali-tool.input';
import { KaliToolRunObject } from './dto/kali-tool-run.object';
import { looksLikeTarget, targetHost } from './validate-kali-run';

const REQUESTED_TOPIC = 'security.kalitool.requested';

interface ScopeRuleLike { ruleType: string; targetType: string; value: string }

function hostInScope(host: string, rules: readonly ScopeRuleLike[]): boolean {
  for (const r of rules) {
    if (r.ruleType !== 'INCLUDE') continue;
    const v = r.value.toLowerCase();
    if (r.targetType === 'DOMAIN' && host === v) return true;
    if (r.targetType === 'WILDCARD_DOMAIN' && (host === v || host.endsWith(`.${v}`))) return true;
    if (r.targetType === 'IP_ADDRESS' && host === v) return true;
  }
  return false;
}

@Injectable()
export class KaliRunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kali: KaliCatalogService,
    @Inject(JOB_BUS) private readonly bus: JobBus,
  ) {}

  async runKaliTool(userId: string, input: RunKaliToolInput): Promise<KaliToolRunObject> {
    // 1. engagement access
    const eng = await this.prisma.engagement.findFirst({ where: { id: input.engagementId } });
    if (!eng) throw new NotFoundException('engagement not found');

    // 2. binary allowlist (SP1 dataset)
    if (!this.kali.findByBinary(input.binary)) {
      throw new ForbiddenException(`unknown / not-allowlisted Kali binary: ${input.binary}`);
    }

    // 3. scope-gate target-like args
    const targets = input.args.filter(looksLikeTarget);
    if (targets.length > 0) {
      const rules = (await this.prisma.scopeRule.findMany({
        where: { engagementId: input.engagementId, ruleType: 'INCLUDE' },
        select: { ruleType: true, targetType: true, value: true },
      })) as ScopeRuleLike[];
      for (const t of targets) {
        if (!hostInScope(targetHost(t), rules)) {
          throw new ForbiddenException(`target out of engagement scope: ${t}`);
        }
      }
    }

    const created = await this.prisma.kaliToolRun.create({
      data: {
        engagementId: input.engagementId,
        createdById: userId,
        binary: input.binary,
        argsJson: input.args,
        target: targets[0] ?? null,
        jsonRequested: input.jsonOutput ?? false,
        status: 'PENDING',
      },
    });

    await this.bus.publish<KaliToolRunPayload>(REQUESTED_TOPIC, created.id, { runId: created.id });
    return this.toObject(created);
  }

  async kaliToolRun(id: string): Promise<KaliToolRunObject | null> {
    const r = await this.prisma.kaliToolRun.findUnique({ where: { id } });
    return r ? this.toObject(r) : null;
  }

  async kaliToolRuns(engagementId: string): Promise<KaliToolRunObject[]> {
    const rows = await this.prisma.kaliToolRun.findMany({
      where: { engagementId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toObject(r));
  }

  private toObject(r: {
    id: string; engagementId: string; binary: string; argsJson: unknown; target: string | null;
    status: string; outputFormat: string | null; exitCode: number | null; parsedJson: unknown;
    errorMessage: string | null; createdAt?: Date;
  }): KaliToolRunObject {
    return {
      id: r.id, engagementId: r.engagementId, binary: r.binary,
      args: Array.isArray(r.argsJson) ? (r.argsJson as string[]) : [],
      target: r.target, status: r.status, outputFormat: r.outputFormat,
      exitCode: r.exitCode, parsedJson: r.parsedJson, errorMessage: r.errorMessage,
      createdAt: r.createdAt ? r.createdAt.toISOString() : null,
    };
  }
}
```

Run: `pnpm nx test api-gateway --testFile=kali-runs.service.spec.ts` → PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api-gateway/src/app/kali-runs/validate-kali-run.ts apps/api-gateway/src/app/kali-runs/dto apps/api-gateway/src/app/kali-runs/kali-runs.service.ts apps/api-gateway/src/app/kali-runs/__tests__
git commit -m "feat(kali-runner): runKaliTool service (allowlist + scope) + DTOs"
```

---

## Task 10: API — resolver (mutation/queries/subscription) + module wiring

**Files:**
- Create: `apps/api-gateway/src/app/kali-runs/dto/kali-tool-run-event.object.ts`
- Create: `apps/api-gateway/src/app/kali-runs/kali-runs.resolver.ts`
- Create: `apps/api-gateway/src/app/kali-runs/kali-runs.module.ts`
- Modify: `apps/api-gateway/src/app/app.module.ts` (import `KaliRunsModule`)

Mirror `apps/api-gateway/src/app/ai-runs/ai-runs.resolver.ts` for the subscription plumbing (it wires
the `@Subscription` to the events subscriber's async iterable), and the ai-runs module for the Redis
subscriber provider.

- [ ] **Step 1: Event DTO**

```ts
// apps/api-gateway/src/app/kali-runs/dto/kali-tool-run-event.object.ts
import { Field, ObjectType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

@ObjectType()
export class KaliToolRunEventObject {
  @Field() type!: string;
  @Field(() => String, { nullable: true }) status?: string | null;
  @Field(() => String, { nullable: true }) message?: string | null;
  @Field(() => GraphQLJSON, { nullable: true }) data?: unknown;
}
```

- [ ] **Step 2: Resolver** (guard-protected; mirror ai-runs.resolver subscription shape)

```ts
// apps/api-gateway/src/app/kali-runs/kali-runs.resolver.ts
import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver, Subscription } from '@nestjs/graphql';
import type { User } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RunKaliToolInput } from './dto/run-kali-tool.input';
import { KaliToolRunObject } from './dto/kali-tool-run.object';
import { KaliToolRunEventObject } from './dto/kali-tool-run-event.object';
import { KaliRunsService } from './kali-runs.service';
import { KaliToolRunEventsSubscriber } from './kali-tool-run-events.subscriber';

@Resolver()
@UseGuards(JwtAuthGuard)
export class KaliRunsResolver {
  constructor(
    private readonly svc: KaliRunsService,
    private readonly events: KaliToolRunEventsSubscriber,
  ) {}

  @Mutation(() => KaliToolRunObject)
  runKaliTool(@CurrentUser() user: User, @Args('input') input: RunKaliToolInput): Promise<KaliToolRunObject> {
    return this.svc.runKaliTool(user.id, input);
  }

  @Query(() => KaliToolRunObject, { nullable: true })
  kaliToolRun(@Args('id', { type: () => ID }) id: string): Promise<KaliToolRunObject | null> {
    return this.svc.kaliToolRun(id);
  }

  @Query(() => [KaliToolRunObject])
  kaliToolRuns(@Args('engagementId', { type: () => ID }) engagementId: string): Promise<KaliToolRunObject[]> {
    return this.svc.kaliToolRuns(engagementId);
  }

  @Subscription(() => KaliToolRunEventObject, {
    resolve: (payload: { type: string; [k: string]: unknown }) => payload,
  })
  kaliToolRunEvents(@Args('runId', { type: () => ID }) runId: string): AsyncIterable<unknown> {
    return this.events.subscribe(runId);
  }
}
```

> If the ai-runs `@Subscription` uses a different `resolve`/return convention, match THAT (read
> `ai-runs.resolver.ts`) — the async-iterable-from-subscriber shape must be identical to what
> already works in this codebase.

- [ ] **Step 3: Module** (mirror ai-runs module: provide the subscriber + its dedicated Redis subscriber client)

```ts
// apps/api-gateway/src/app/kali-runs/kali-runs.module.ts
import { Module, type Provider } from '@nestjs/common';
import IORedis from 'ioredis';

import { AppConfigModule, AppConfigService } from '@autoscanner/config';
import { PrismaModule } from '@autoscanner/database';
import { MessagingModule } from '@autoscanner/messaging';

import { AuthModule } from '../auth/auth.module';
import { ToolsModule } from '../tools/tools.module'; // exports KaliCatalogService
import { KaliRunsService } from './kali-runs.service';
import { KaliRunsResolver } from './kali-runs.resolver';
import {
  KaliToolRunEventsSubscriber,
  KALI_TOOL_RUN_EVENTS_SUBSCRIBER,
} from './kali-tool-run-events.subscriber';

const subRedisProvider: Provider = {
  provide: KALI_TOOL_RUN_EVENTS_SUBSCRIBER,
  inject: [AppConfigService],
  useFactory: (cfg: AppConfigService) => new IORedis(cfg.env.REDIS_URL, { lazyConnect: false }),
};

@Module({
  imports: [AppConfigModule, AuthModule, PrismaModule, MessagingModule.forRoot(), ToolsModule],
  providers: [KaliRunsService, KaliRunsResolver, KaliToolRunEventsSubscriber, subRedisProvider],
})
export class KaliRunsModule {}
```

> `ToolsModule` must `export` `KaliCatalogService` for `KaliRunsService` to inject it — if it does not
> already (it doesn't in SP1), add `exports: [KaliCatalogService]` to `apps/api-gateway/src/app/tools/tools.module.ts` in this task.

- [ ] **Step 4: Wire into app.module** — add `KaliRunsModule` to the `imports` of `apps/api-gateway/src/app/app.module.ts`.

- [ ] **Step 5: Verify**

Run: `pnpm nx type-check api-gateway` → PASS.
Run: `pnpm nx test api-gateway --skip-nx-cache` → whole suite green (paste summary).

- [ ] **Step 6: Commit**

```bash
git add apps/api-gateway/src/app/kali-runs apps/api-gateway/src/app/app.module.ts apps/api-gateway/src/app/tools/tools.module.ts
git commit -m "feat(kali-runner): runKaliTool mutation + queries + kaliToolRunEvents subscription"
```

---

## Task 11: `kali-toolbox` image + provisioning docs

**Files:**
- Modify: `tools/scanners/build-images.sh`
- Create: `apps/kali-tool-worker/README.md`

- [ ] **Step 1: Add the image build** — in `tools/scanners/build-images.sh`, add a build for
`autoscanner/kali-toolbox:1.0` from a `kalilinux/kali-rolling` base installing `kali-linux-large`
(reuse the SP1 `tools/kali-catalog/Dockerfile.kali-catalog` approach, or a minimal dedicated
Dockerfile `docker/Dockerfile.kali-toolbox`). Follow the existing script's per-image pattern.

- [ ] **Step 2: README** — `apps/kali-tool-worker/README.md`: how to run (`pnpm dev:kali-tool-worker` on the host, infra + kafka topics provisioned via `pnpm kafka:provision`), that the `kali-toolbox` image must be built (`pnpm scanners:build`), and that the SP1 dataset (`pnpm kali:catalog`) governs the binary allowlist.

- [ ] **Step 3: Commit**

```bash
git add tools/scanners/build-images.sh apps/kali-tool-worker/README.md
git commit -m "feat(kali-runner): kali-toolbox image build + worker README"
```

---

## Final verification

- [ ] `pnpm nx test kali-tool-worker --skip-nx-cache` → all green (parser + both consumers).
- [ ] `pnpm nx test api-gateway --skip-nx-cache` → all green (service + subscriber + no regression).
- [ ] `pnpm nx test messaging --testFile=topics.spec.ts` → green.
- [ ] `pnpm nx type-check api-gateway && pnpm nx type-check kali-tool-worker` → clean.
- [ ] `pnpm nx build kali-tool-worker && pnpm nx build api-gateway` → build.
- [ ] Manual note (not CI): full loop needs infra (`pnpm dev:up`), topics (`pnpm kafka:provision`), the `kali-toolbox` image (`pnpm scanners:build`), the worker running on host (`pnpm dev:kali-tool-worker`), and an allowlisted binary (generate the dataset with `pnpm kali:catalog`, or use a seed tool).

---

## Self-review notes (author)

- **Spec coverage:** model+migration → T1; topics → T2; payloads → T3; parser → T4; worker+bootstrap →
  T5; events pub/sub → T6; run consumer (exec/capture/store/publish) → T7; parse+persist → T8;
  mutation+allowlist+scope+queries → T9; subscription+wiring → T10; kali-toolbox image + docs → T11.
- **Type consistency:** `KaliToolRunPayload {runId}` / `KaliToolParsePayload {runId, rawOutputKey}`
  defined T3, used T7/T8/T9; topics strings identical across T2/T7/T8/T9; `parseToolOutput` signature
  T4 == usage T8; `KaliCatalogService.findByBinary` (from SP1) used T9 — requires `ToolsModule` to
  export it (added T10 Step 3).
- **Deferred-to-implementer reads (pattern clones, not placeholders):** worker nx scaffolding (T5)
  and the events subscriber (T6) are copied from named existing files; the subscription resolver
  convention (T10) must match `ai-runs.resolver.ts`. These are explicit "mirror file X" instructions
  with the exact APIs embedded above, not vague gaps.
- **Open risk:** `parsedJson` stored as `{format, view}` — Prisma `Json` column accepts it; the
  cast `as unknown as object` in T8 satisfies the client type. Confirm at implementation.
