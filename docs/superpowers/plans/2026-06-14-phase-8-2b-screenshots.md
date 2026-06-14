# Phase 8.2b — Web Screenshots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Capture a PNG screenshot of each web host (gowitness) and make it retrievable via the existing raw-output presign — by teaching the scan-worker to capture a binary FILE artifact (not just text stdout/stderr).

**Architecture:** Extend `ScanJobProcessor` to handle `output.capture: { path }`: bind-mount a per-job host dir to `/output`, set the scanner's `ctx.scratchDir` to `/output`, run, read the produced file, store it binary to `raw-outputs` (contentType image/png) as the job's `rawOutputKey`, mark COMPLETED, and SKIP the parse-job enqueue (binary → nothing to normalize). Add a `gowitness` scanner that writes its PNG there. No new Prisma model — the PNG is the gowitness job's raw output, served by the existing `getRawOutputPresignedUrl`.

**Tech Stack:** NestJS, Nx, Docker (gowitness/headless chromium), Jest. Spec: `docs/superpowers/specs/2026-06-14-phase-8-2b-screenshots-design.md`. Pattern ref: Phase 8.1/8.2 scanners.

---

## Reference (read once)
- `apps/scan-worker/src/app/scan-job.processor.ts` — the processor. Key spots: `const build = scanner.build(..., { scratchDir: '/tmp' })` (~line 60); `runSpec` `binds: build.binds` (~line 100); `const output = scanner.outputs[0]; const capturedStream = output.capture;` (~line 114); `captureChunk` (~142) compares `stream !== capturedStream` (so an OBJECT capturedStream naturally captures nothing — stdout still streams to log); post-run store via `rawOutputKey(...)` + `storage.putObject(...)` (~214-230); parse enqueue `this.parseQueue.add('parse', { ... parserName: output.parser })` (~268). `MAX_RAW_OUTPUT_BYTES` constant exists.
- `apps/scan-worker/src/app/__tests__/scan-job.processor.spec.ts` — the existing unit test (mock docker-runner, storage, prisma, parseQueue, logStream). Mirror its mock setup.
- `libs/scanner-sdk/src/types.ts` — `ScannerOutput.capture: 'stdout' | 'stderr' | { path: string }`; `RawOutputFormat` includes `'BINARY'`; `BuildContext.scratchDir`.
- `libs/scanners/asnmap/` — scanner lib scaffold. `docker/scanners/crtsh/Dockerfile` — Dockerfile house style.
- `libs/storage/src` — `ObjectStorage.putObject({ bucket, key, body: Buffer, contentType })`, `rawOutputKey(...)`.

---

## Task 1: scan-worker binary file-capture (TDD — the core)

**Files:** Modify `apps/scan-worker/src/app/scan-job.processor.ts`; Test `apps/scan-worker/src/app/__tests__/scan-job.processor.spec.ts`.

Implement a `file-capture` branch: when `scanner.outputs[0].capture` is an object `{ path }`, the worker bind-mounts a per-job host dir and reads the produced file instead of capturing stdout.

- [ ] **Step 1: Read the existing processor + its spec fully** to understand the mock harness and the exact lines.

- [ ] **Step 2: Write failing tests** in `scan-job.processor.spec.ts`. Add a `describe('file capture (binary artifact)')` block. Use a scanner whose `outputs[0]` is `{ format: 'BINARY', capture: { path: '' }, parser: 'noop' }`. Make the mock `docker.run` write a fake PNG into the bound host dir (the mock can read `spec.binds` to find the host dir and `fs.writeFileSync(join(hostDir,'shot.png'), Buffer.from([0x89,0x50,0x4e,0x47]))`). Assert:
  1. `scanner.build` was called with `ctx.scratchDir === '/output'` (capture how build is invoked — the mock scanner's `build` records its ctx).
  2. `runSpec.binds` passed to `docker.run` includes a bind with `dst === '/output'` and a real `src`.
  3. After a successful run, `storage.putObject` was called with `bucket: 'raw-outputs'`, a `Buffer` body equal to the fake PNG bytes, and `contentType: 'image/png'`.
  4. `parseQueue.add` was NOT called (binary → no parse).
  5. `prisma.scanJob.update` set `status: 'COMPLETED'` with a `rawOutputKey`.
  6. When the mock run produces NO file → job FAILED with a "no artifact" message.
  7. The host temp dir no longer exists after processing (cleanup).
  Keep ALL existing stdout/stderr-capture tests passing unchanged.

- [ ] **Step 3: Implement** in `scan-job.processor.ts`:
  - Add imports: `import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';` `import { tmpdir } from 'node:os';` `import { join } from 'node:path';`
  - **Before** the `scanner.build(...)` call, peek the capture mode:
    ```ts
    const out0 = scanner.outputs[0];
    const fileCapture = typeof out0.capture === 'object' ? out0.capture : null;
    let artifactHostDir: string | null = null;
    if (fileCapture) {
      artifactHostDir = await mkdtemp(join(tmpdir(), 'autoscanner-art-'));
    }
    ```
  - Change the `build()` call's `scratchDir` to `artifactHostDir ? '/output' : '/tmp'`.
  - In `runSpec`, set `binds: artifactHostDir ? [...(build.binds ?? []), { src: artifactHostDir, dst: '/output' }] : build.binds`.
  - Wrap the post-run body in a `try { ... } finally { if (artifactHostDir) await rm(artifactHostDir, { recursive: true, force: true }).catch(() => {}); }` so the host dir is always cleaned.
  - **After** the run succeeds (and the existing `oversized` text-path guard, which won't trigger for object capture), branch:
    ```ts
    let storeBody: Buffer;
    let storeContentType: string;
    if (fileCapture && artifactHostDir) {
      const files = await readdir(artifactHostDir);
      const wanted = fileCapture.path ? files.find((f) => f === fileCapture.path || f.endsWith(fileCapture.path)) : files[0];
      if (!wanted) {
        await this.prisma.scanJob.update({ where: { id: payload.scanJobId }, data: { status: 'FAILED', completedAt: new Date(), exitCode: result.exitCode, durationMs: result.durationMs, errorMessage: 'scanner produced no artifact file' } });
        throw new Error(`scanJob=${payload.scanJobId} produced no artifact file`);
      }
      storeBody = await readFile(join(artifactHostDir, wanted));
      if (storeBody.byteLength > MAX_RAW_OUTPUT_BYTES) {
        await this.prisma.scanJob.update({ where: { id: payload.scanJobId }, data: { status: 'FAILED', completedAt: new Date(), errorMessage: `artifact exceeded ${MAX_RAW_OUTPUT_BYTES} bytes` } });
        throw new Error(`scanJob=${payload.scanJobId} artifact too large`);
      }
      storeContentType = wanted.endsWith('.png') ? 'image/png' : 'application/octet-stream';
    } else {
      storeBody = Buffer.from(capturedChunks.join(''), 'utf8');
      storeContentType = out0.format === 'XML' ? 'application/xml' : 'application/octet-stream';
    }
    ```
    Then `putObject({ bucket: 'raw-outputs', key, body: storeBody, contentType: storeContentType })` (replace the existing inline body/contentType with these vars).
  - **Skip parse enqueue** when `out0.format === 'BINARY'` (wrap the `this.parseQueue.add('parse', ...)` call in `if (out0.format !== 'BINARY') { ... }`).
  - The COMPLETED status update + `rawOutputKey` set stays as-is (it already runs for all formats).

- [ ] **Step 4: Run** `pnpm nx test scan-worker` → all green (new file-capture cases + existing text cases). `pnpm nx run scan-worker:type-check` → green.

- [ ] **Step 5: Commit** `feat(phase-8.2b): scan-worker captures binary file artifacts (capture:{path})`.

---

## Task 2: `gowitness` scanner (TDD)

**Files:** lib `libs/scanners/gowitness/`; test; `tsconfig.base.json`. (No parser — binary capture; `parser: 'noop'` is never invoked.)

- [ ] **Step 1: Scaffold** `libs/scanners/gowitness/` by copying `libs/scanners/asnmap/`; rename `asnmap`→`gowitness`, `Asnmap`→`Gowitness`, project `scanners-asnmap`→`scanners-gowitness`; alias `@autoscanner/scanners-gowitness`. Verify no `asnmap` leftovers. Delete any copied parser-coupling (asnmap had none in the lib itself).

- [ ] **Step 2: Failing scanner test** `src/__tests__/gowitness.scanner.spec.ts`:
```ts
import { GowitnessScanner } from '../gowitness.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';
const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/output' };
describe('GowitnessScanner', () => {
  it('declares BINARY file capture, no credential, no parse', () => {
    expect(GowitnessScanner.name).toBe('gowitness');
    expect(GowitnessScanner.docker.image).toBe('autoscanner/gowitness:1.0');
    expect(GowitnessScanner.outputs[0].format).toBe('BINARY');
    expect(GowitnessScanner.outputs[0].capture).toEqual({ path: '' });
    expect(GowitnessScanner.requiresCredential).toBeUndefined();
  });
  it('build() writes the screenshot into ctx.scratchDir and quotes the target', () => {
    const { cmd } = GowitnessScanner.build(GowitnessScanner.inputSchema.parse({}), 'example.com', ctx);
    expect(cmd[0]).toBe('sh');
    expect(cmd[2]).toContain('gowitness');
    expect(cmd[2]).toContain("'example.com'");
    expect(cmd[2]).toContain('--screenshot-path /output');
  });
});
```
Run `pnpm nx test scanners-gowitness` → FAIL.

- [ ] **Step 3: Implement** `libs/scanners/gowitness/src/gowitness.scanner.ts`:
```ts
import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';
const GowitnessInput = z.object({});
export type GowitnessInputType = z.infer<typeof GowitnessInput>;
function shellQuoteSingle(s: string): string { return `'${s.replace(/'/g, "'\\''")}'`; }
export const GowitnessScanner: ScannerDefinition<GowitnessInputType> = {
  name: 'gowitness',
  displayName: 'gowitness (screenshot)',
  category: [ScannerCategory.WEB_FINGERPRINT],
  description: 'Captures a screenshot (PNG) of a web host via headless chromium (gowitness). Actively probes the target.',
  inputSchema: GowitnessInput,
  docker: { image: 'autoscanner/gowitness:1.0', network: 'bridge', capabilities: [], readonlyRootfs: true, memoryLimitMb: 1536, cpuQuota: 2_000_000, defaultTimeoutMs: 180_000 },
  build(_input, target, ctx) {
    // gowitness writes <host>.png into --screenshot-path; the worker bind-mounts
    // ctx.scratchDir (=/output) to a host dir and stores the produced PNG.
    const script = `gowitness single ${shellQuoteSingle(target)} --screenshot-path ${ctx.scratchDir} --disable-db || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'BINARY', capture: { path: '' }, parser: 'noop' }],
  produces: ['Screenshot'],
};
```
> Verify the real gowitness CLI flags (`single`, `--screenshot-path`, `--disable-db`) against the installed version (gowitness v2/v3 differ — e.g. v3 uses `gowitness scan single -u <url> --screenshot-path`). Adjust the script to the version in the Dockerfile (Task 3) and keep the test's substring assertions in sync. Note: `'Screenshot'` must be a valid `ProducedEntity` — if the union doesn't include it, add `'Screenshot'` to `ProducedEntity` in `libs/scanner-sdk/src/types.ts` (a 1-line additive change) OR use an existing value; report which.

Update `index.ts` + `gowitness.module.ts`. Run `pnpm nx test scanners-gowitness` → PASS. `type-check -p scanners-gowitness,scanner-sdk` → green.

- [ ] **Step 4: Commit** `feat(phase-8.2b): gowitness screenshot scanner (BINARY file capture)`.

---

## Task 3: Dockerfile `gowitness`

**Files:** `docker/scanners/gowitness/Dockerfile`.

- [ ] **Step 1:** Create a Dockerfile that provides `gowitness` + headless chromium. Base on an image with chromium (e.g. `FROM golang:1.22-bookworm AS build` → `go install github.com/sensepost/gowitness@latest`; runtime `FROM debian:bookworm-slim` + `apt-get install -y --no-install-recommends chromium ca-certificates fonts-liberation`, copy the gowitness binary). gowitness needs `--no-sandbox` chromium flags in a container — document that gowitness auto-passes them or add the relevant env/flag. Non-root user, `ENTRYPOINT []`. **Confirm the gowitness version + its single-screenshot subcommand** and keep Task 2's `build()` script in sync.
- [ ] **Step 2:** `ls docker/scanners/gowitness/Dockerfile`. Commit `feat(phase-8.2b): Dockerfile for gowitness (headless chromium)`.

---

## Task 4: Register + (optional) template

**Files:** `libs/scanners/all/src/all-scanners.module.ts` (+ spec); optionally `libs/templates/src/builtins/`.

- [ ] **Step 1:** Add `GowitnessScannerModule` (from `@autoscanner/scanners-gowitness`) to `SCANNER_MODULES` in `all-scanners.module.ts`. Update `all-scanners.module.spec.ts` to assert `gowitness` is registered.
- [ ] **Step 2 (optional):** Add `gowitness` as a step to the existing `web-enrich` template (so screenshots run alongside the other enrichment), OR create a dedicated `web-screenshot` template. If adding to `web-enrich`, update `builtins.spec.ts` only if it asserts the step set (it likely doesn't). Recommended: add gowitness to `web-enrich`.
- [ ] **Step 3:** `pnpm nx run-many -t type-check,test -p scanners-all,templates` → green. Commit `feat(phase-8.2b): register gowitness scanner + add to web-enrich`.

---

## Task 5: e2e (opt-in) + full validation

**Files:** `apps/api-gateway-e2e/src/scenarios/screenshot-e2e.spec.ts`.

- [ ] **Step 1:** Opt-in e2e gated by base env + `SCREENSHOT_E2E=1` (mirror `web-enrich-e2e.spec.ts`). Scenario: login; `createEngagementWithWildcardScope`; run a template/scan with `gowitness` against a real host; poll until the scan job is COMPLETED; fetch the raw-output presigned URL for the gowitness job (use the existing scan-job raw query/REST — inspect how `web-enrich`/scan e2e or the `scans` resolver exposes job raw output; the REST endpoint is `GET /scans/jobs/:id/raw`); GET the URL and assert `content-type` starts with `image/png` and the body is non-empty. Suite stays skipped without the gate; type-check only.
- [ ] **Step 2: Full validation:**
```
pnpm nx run-many -t lint,type-check,test -p scanner-sdk,scanners-gowitness,scanners-all,templates,scan-worker,api-gateway,parser-worker
```
+ `npx tsc --project apps/api-gateway-e2e/tsconfig.spec.json --noEmit` + `pnpm nx run-many -t build -p scan-worker,api-gateway,parser-worker`. All green.
- [ ] **Step 3:** Commit `test(phase-8.2b): screenshot e2e (opt-in) + validation`.

---

## Validation criteria (spec §1)
scan-worker file capture (T1); gowitness scanner (T2); Dockerfile (T3); register + template (T4); PNG retrievable via existing presign + e2e (T5); CI green incl. build. No new Prisma model. ✅

## Out of scope
Rich UI thumbnail/gallery; multi-screenshot/visual-diff; dedicated Screenshot model. The existing raw-output presign serves the PNG in V1.

## Self-review notes
- The ONLY transverse change is T1 (scan-worker), isolated in an `if (fileCapture)` branch; the text stdout/stderr path is untouched (existing tests stay green). `finally` cleanup guarantees no host-dir leak.
- No new model: PNG reuses `ScanJob.rawOutputKey` + the existing presign. `RawOutputFormat` already has `BINARY`; `ScannerOutput.capture` already allows `{ path }`.
- `ProducedEntity` may need `'Screenshot'` added (1-line) — flagged in T2.
- External-tool caveat: gowitness CLI differs across v2/v3 — T2 build() + T3 Dockerfile must agree on the version/subcommand; verify at impl time.
