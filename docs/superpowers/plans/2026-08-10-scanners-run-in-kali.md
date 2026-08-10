# Scanners Run in the Kali Toolbox — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route allowlisted scanners to the single `autoscanner/kali-toolbox:1.0` image instead of a per-tool image, keeping cmd/caps/network identical, with the tool's own image as a strict 126/127 fallback.

**Architecture:** A verified allowlist (scanner names) drives image selection in `scan-worker`. The image is chosen per job; if the toolbox run exits 126/127 (binary missing/not-executable — e.g. nmap's file-caps blocking exec), the job re-runs once with the scanner's own image. Pure helpers make the decision testable; a gated guard keeps the allowlist honest against the image.

**Tech Stack:** NestJS worker (scan-worker), dockerode runner, Jest.

**Reference spec:** `docs/superpowers/specs/2026-08-10-scanners-run-in-kali-design.md`

**Branch:** `feat/scanners-run-in-kali` (created; spec committed there).

**Verified allowlist (scanner names):** nmap, masscan, sslscan, whatweb, nikto, dnsrecon, ffuf, feroxbuster, wpscan, gobuster, onesixtyone, amass, sqli-scan, cmdi-scan, snmp-recon, smtp-recon.
**Excluded (documented):** httpx + favicon (Kali ships Python httpx, a name collision — exits 0 with wrong output, fallback can't catch it); nuclei + exposed-config + web-dast (need nuclei templates — exit 0, silent); absent binaries (naabu, subfinder, dalfox, enum4linux-ng, testssl, kerbrute).

---

## File Structure

- `libs/common/src/kali-toolbox.ts` — shared `KALI_TOOLBOX_IMAGE` (create; single source of truth).
- `libs/common/src/index.ts` — export the above (modify).
- `apps/kali-tool-worker/src/app/kali-toolbox.ts` — import+re-export `KALI_TOOLBOX_IMAGE` from `@autoscanner/common` (modify; keep other helpers).
- `apps/scan-worker/src/app/kali-routing.ts` — `KALI_TOOLBOX_ALLOWLIST`, `resolveScanImage`, `isExecFailure` (create).
- `apps/scan-worker/src/app/__tests__/kali-routing.spec.ts` — unit tests (create).
- `apps/scan-worker/src/app/scan-job.processor.ts` — pick image + 126/127 fallback (modify).
- `apps/scan-worker/src/app/__tests__/kali-toolbox-presence.spec.ts` — gated guard: allowlisted binaries present in the image (create).

---

## Task 1: Centralize `KALI_TOOLBOX_IMAGE` in `@autoscanner/common`

**Files:**
- Create: `libs/common/src/kali-toolbox.ts`
- Modify: `libs/common/src/index.ts`
- Modify: `apps/kali-tool-worker/src/app/kali-toolbox.ts`

- [ ] **Step 1: Create the shared constant**

`libs/common/src/kali-toolbox.ts`:

```ts
/** The single Kali toolbox image that holds every bundled Kali tool. */
export const KALI_TOOLBOX_IMAGE = 'autoscanner/kali-toolbox:1.0';
```

- [ ] **Step 2: Export it from the barrel**

Append to `libs/common/src/index.ts`:

```ts
export * from './kali-toolbox';
```

- [ ] **Step 3: Re-point the kali-tool-worker constant to the shared one**

In `apps/kali-tool-worker/src/app/kali-toolbox.ts`, replace the local literal:

```ts
export const KALI_TOOLBOX_IMAGE = 'autoscanner/kali-toolbox:1.0';
```

with a re-export (keep every other line in the file unchanged):

```ts
import { KALI_TOOLBOX_IMAGE } from '@autoscanner/common';
export { KALI_TOOLBOX_IMAGE };
```

Ensure the existing `import type { RunSpec } from '@autoscanner/docker-runner';` line stays.

- [ ] **Step 4: Type-check both projects**

Run: `pnpm nx type-check kali-tool-worker && pnpm nx type-check scan-worker`
Expected: PASS (scan-worker unchanged yet; kali-tool-worker resolves the re-export).

- [ ] **Step 5: Commit**

```bash
git add libs/common/src/kali-toolbox.ts libs/common/src/index.ts apps/kali-tool-worker/src/app/kali-toolbox.ts
git commit -m "refactor(common): single source of truth for KALI_TOOLBOX_IMAGE"
```

---

## Task 2: Routing helpers (`resolveScanImage`, `isExecFailure`, allowlist)

**Files:**
- Create: `apps/scan-worker/src/app/kali-routing.ts`
- Test: `apps/scan-worker/src/app/__tests__/kali-routing.spec.ts`

- [ ] **Step 1: Write the failing test**

`apps/scan-worker/src/app/__tests__/kali-routing.spec.ts`:

```ts
import { KALI_TOOLBOX_IMAGE } from '@autoscanner/common';
import {
  KALI_TOOLBOX_ALLOWLIST,
  isExecFailure,
  resolveScanImage,
} from '../kali-routing';

describe('kali-routing', () => {
  it('routes an allowlisted scanner to the toolbox image, with its own image as fallback', () => {
    const r = resolveScanImage('sslscan', 'sslscan-own:1.0');
    expect(r.image).toBe(KALI_TOOLBOX_IMAGE);
    expect(r.fallbackImage).toBe('sslscan-own:1.0');
    expect(r.usesKali).toBe(true);
  });

  it('leaves a non-allowlisted scanner on its own image, no fallback', () => {
    const r = resolveScanImage('naabu', 'naabu-own:1.0');
    expect(r.image).toBe('naabu-own:1.0');
    expect(r.fallbackImage).toBeNull();
    expect(r.usesKali).toBe(false);
  });

  it('never routes the known-collision / template scanners', () => {
    for (const excluded of ['httpx', 'favicon', 'nuclei', 'exposed-config', 'web-dast']) {
      expect(KALI_TOOLBOX_ALLOWLIST.has(excluded)).toBe(false);
    }
  });

  it('treats only 126/127 as an exec failure (not a normal non-zero exit)', () => {
    expect(isExecFailure(126)).toBe(true);
    expect(isExecFailure(127)).toBe(true);
    expect(isExecFailure(0)).toBe(false);
    expect(isExecFailure(1)).toBe(false);
    expect(isExecFailure(-1)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test scan-worker --testFile=kali-routing.spec.ts`
Expected: FAIL — cannot find module `../kali-routing`.

- [ ] **Step 3: Write the module**

`apps/scan-worker/src/app/kali-routing.ts`:

```ts
import { KALI_TOOLBOX_IMAGE } from '@autoscanner/common';

/**
 * Scanners verified to run correctly inside the Kali toolbox image. Excludes
 * name-collisions (httpx → Kali ships Python httpx; favicon uses httpx) and
 * template/asset-dependent tools (nuclei, exposed-config, web-dast) because those
 * exit 0 with wrong/empty output — the 126/127 fallback cannot catch them.
 * nmap/masscan are included on purpose: their file-caps block exec in the sandbox
 * (exit 126/127), which the fallback DOES catch, re-running them on their own image.
 */
export const KALI_TOOLBOX_ALLOWLIST: ReadonlySet<string> = new Set([
  'nmap',
  'masscan',
  'sslscan',
  'whatweb',
  'nikto',
  'dnsrecon',
  'ffuf',
  'feroxbuster',
  'wpscan',
  'gobuster',
  'onesixtyone',
  'amass',
  'sqli-scan',
  'cmdi-scan',
  'snmp-recon',
  'smtp-recon',
]);

export interface ScanImageChoice {
  image: string;
  /** The scanner's own image, used to retry if the toolbox can't exec the binary. */
  fallbackImage: string | null;
  usesKali: boolean;
}

/** Pick the image a scanner runs in: the toolbox when allowlisted, else its own. */
export function resolveScanImage(scannerName: string, ownImage: string): ScanImageChoice {
  if (KALI_TOOLBOX_ALLOWLIST.has(scannerName)) {
    return { image: KALI_TOOLBOX_IMAGE, fallbackImage: ownImage, usesKali: true };
  }
  return { image: ownImage, fallbackImage: null, usesKali: false };
}

/**
 * True only for container exit 126 (not executable) / 127 (not found) — the
 * toolbox lacking or being unable to exec the binary. A normal tool non-zero
 * exit (1, 2, …) is NOT an exec failure and must not trigger a fallback.
 */
export function isExecFailure(exitCode: number): boolean {
  return exitCode === 126 || exitCode === 127;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test scan-worker --testFile=kali-routing.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/scan-worker/src/app/kali-routing.ts apps/scan-worker/src/app/__tests__/kali-routing.spec.ts
git commit -m "feat(scan-worker): kali toolbox routing helpers + verified allowlist"
```

---

## Task 3: Wire image selection + 126/127 fallback into the processor

The processor's run is wrapped in streaming/capture closures, so the fallback must
re-run cleanly. Extract the single `docker.run({...})` call (currently at
`scan-job.processor.ts:385`) into a local `runOnce(image)` that captures into fresh
buffers, then call it a second time with the own image when the first attempt is an
exec failure. Do NOT change capture/persist logic — only the image and the retry.

**Files:**
- Modify: `apps/scan-worker/src/app/scan-job.processor.ts`

- [ ] **Step 1: Select the image before the run**

Add the import near the top with the other local imports:

```ts
import { isExecFailure, resolveScanImage } from './kali-routing';
```

Replace the image assignment + pull (currently around lines 306–309):

```ts
      await this.docker.pullIfMissing(scanner.docker.image);

      const runSpec: RunSpec = {
        image: scanner.docker.image,
```

with:

```ts
      const imageChoice = resolveScanImage(scanner.name, scanner.docker.image);
      await this.docker.pullIfMissing(imageChoice.image);

      const runSpec: RunSpec = {
        image: imageChoice.image,
```

(Leave every other `runSpec` field — cmd/env/binds/network/capabilities/etc. — unchanged.)

- [ ] **Step 2: Retry once on an exec failure**

Locate the `result = await this.docker.run({ ...runSpec, abortSignal, onStdout, onStderr })` block (starts at ~line 385). After that call returns (still inside the same `try`), before the log-flush/finalize logic uses `result`, insert:

```ts
        if (
          imageChoice.usesKali &&
          imageChoice.fallbackImage &&
          isExecFailure(result.exitCode)
        ) {
          this.logger.warn(
            `scanJob=${payload.scanJobId} scanner=${scanner.name} exit=${result.exitCode} in kali-toolbox; retrying on own image ${imageChoice.fallbackImage}`,
          );
          logBuffer.reset();
          resetCapture();
          await this.docker.pullIfMissing(imageChoice.fallbackImage);
          result = await this.docker.run({
            ...runSpec,
            image: imageChoice.fallbackImage,
            abortSignal: oversizeAbort.signal,
            onStdout: (chunk) => {
              captureChunk('stdout', chunk);
              logBuffer.append('stdout', chunk);
              safePublish('stdout', chunk);
            },
            onStderr: (chunk) => {
              captureChunk('stderr', chunk);
              logBuffer.append('stderr', chunk);
              safePublish('stderr', chunk);
            },
          });
        }
```

- [ ] **Step 3: Add the capture-reset hook**

The retry must discard the failed attempt's captured bytes so only the fallback's
output is stored. Find where capture state is declared (the `captureChunk` closure
and its backing buffer, near the `runSpec`/capture setup) and add a `resetCapture()`
that clears the backing buffer(s). If capture accumulates into a local array/Buffer
list `captured`, implement:

```ts
      const resetCapture = () => {
        captured.length = 0; // drop the failed toolbox attempt's bytes
      };
```

Match the actual accumulator name in the file (read the capture setup around lines
325–384). `logBuffer.reset()` — confirm `LogBuffer` exposes `reset()`; if it exposes
`clear()` instead, use that. If neither exists, add a `reset()` to `LogBuffer`
(`libs/log-stream`) that empties its internal buffer, with a one-line unit test.

- [ ] **Step 4: Type-check + full scan-worker tests**

Run: `pnpm nx type-check scan-worker`
Expected: PASS.
Run: `pnpm nx test scan-worker`
Expected: PASS (existing suite still green).

- [ ] **Step 5: Commit**

```bash
git add apps/scan-worker/src/app/scan-job.processor.ts
git commit -m "feat(scan-worker): run allowlisted scanners in kali-toolbox with 126/127 fallback"
```

---

## Task 4: Gated guard — allowlisted binaries present in the image

Keeps the allowlist honest: every allowlisted scanner's underlying binary
(`build().cmd[0]`) must be on PATH in `kali-toolbox`. Gated behind image
availability so it is skipped in environments without the 25 GB image.

**Files:**
- Test: `apps/scan-worker/src/app/__tests__/kali-toolbox-presence.spec.ts`

- [ ] **Step 1: Write the guard**

```ts
import { execFileSync } from 'node:child_process';
import { z } from 'zod';
import { ScannerRegistry, type ScannerDefinition } from '@autoscanner/scanner-sdk';
import { AllScannersModule } from '@autoscanner/scanners-all';
import { Test } from '@nestjs/testing';
import { KALI_TOOLBOX_IMAGE } from '@autoscanner/common';
import { KALI_TOOLBOX_ALLOWLIST } from '../kali-routing';

function imageAvailable(): boolean {
  try {
    execFileSync('docker', ['image', 'inspect', KALI_TOOLBOX_IMAGE], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const maybe = imageAvailable() ? describe : describe.skip;

maybe('kali-toolbox binary presence (gated: needs the image)', () => {
  let registry: ScannerRegistry;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AllScannersModule] }).compile();
    registry = moduleRef.get(ScannerRegistry);
  });

  it('every allowlisted scanner build()s a binary that exists in the toolbox', () => {
    const ctx = { scanJobId: 'guard', engagementId: 'guard', scratchDir: '/tmp' };
    const missing: string[] = [];
    for (const name of KALI_TOOLBOX_ALLOWLIST) {
      const def: ScannerDefinition = registry.get(name);
      const input = def.inputSchema.parse({});
      const binary = def.build(input as never, '127.0.0.1', ctx as never).cmd[0];
      try {
        execFileSync(
          'docker',
          ['run', '--rm', '--entrypoint', 'sh', KALI_TOOLBOX_IMAGE, '-c', `command -v ${binary}`],
          { stdio: 'ignore' },
        );
      } catch {
        missing.push(`${name} → ${binary}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
```

> If any scanner's `build({})` throws because a field is required, pass a minimal
> valid input for that scanner (read its `inputSchema`) instead of `{}`. `z` is
> imported for that case.

- [ ] **Step 2: Run the guard**

Run: `pnpm nx test scan-worker --testFile=kali-toolbox-presence.spec.ts`
Expected: PASS if the image is present (all binaries found), or the suite is
SKIPPED if the image is absent. If a binary is reported missing, remove that scanner
from `KALI_TOOLBOX_ALLOWLIST` (it isn't actually in the image) and re-run.

- [ ] **Step 3: Commit**

```bash
git add apps/scan-worker/src/app/__tests__/kali-toolbox-presence.spec.ts
git commit -m "test(scan-worker): gated guard that allowlisted binaries exist in kali-toolbox"
```

---

## Task 5: End-to-end verification on the running worker

- [ ] **Step 1: Restart scan-worker with the new code**

scan-worker runs on the host (not in the app container). Restart it:
```
pnpm nx serve scan-worker
```
(or restart the existing `pnpm dev:workers`). parser-worker must also be running.

- [ ] **Step 2: Smoke a toolbox-routed scan (exit-0 tool)**

Launch a `whatweb` scan against a safe target via the API (or the cockpit). In the
scan-worker logs, confirm the run used `autoscanner/kali-toolbox:1.0` (no
"retrying on own image" line) and the scan reaches COMPLETED with findings.

- [ ] **Step 3: Smoke the fallback path (nmap)**

Launch an `nmap` scan. Confirm the logs show `exit=12{6,7} in kali-toolbox; retrying
on own image …`, then the fallback run completes and produces findings (parsed from
the OWN image's nmap). This proves the fallback works end-to-end.

- [ ] **Step 4: Confirm the exit code assumption**

If nmap's toolbox attempt does NOT exit 126/127 (e.g. the wrapper masks it to 1),
the fallback won't trigger. Verify the actual code:
```bash
docker run --rm --entrypoint sh autoscanner/kali-toolbox:1.0 -c 'nmap -p 80 127.0.0.1 >/dev/null 2>&1; echo exit=$?'
```
If it is not 126/127, either (a) drop nmap/masscan from the allowlist, or (b) widen
`isExecFailure` to include the observed code — update the Task 2 test to match and
re-run. Do not leave nmap allowlisted with a fallback that never fires.

- [ ] **Step 5: Final check**

Run: `pnpm nx test scan-worker && pnpm nx type-check scan-worker`
Expected: PASS.

---

## Self-Review notes (addressed)

- **Spec coverage:** shared image constant (Task 1), verified allowlist + routing (Task 2), image swap + 126/127 fallback (Task 3), gated presence guard (Task 4), end-to-end + parser reality check (Task 5). Exclusions (httpx/favicon/nuclei/exposed-config/web-dast) encoded and asserted (Task 2 test).
- **Fallback correctness:** the retry resets both the log buffer and the capture accumulator so only the fallback attempt's output is stored; only 126/127 triggers it.
- **Naming consistency:** `KALI_TOOLBOX_IMAGE`, `KALI_TOOLBOX_ALLOWLIST`, `resolveScanImage` → `{ image, fallbackImage, usesKali }`, `isExecFailure` are used identically across module, processor, guard, and tests.
- **Risk flagged:** Task 3 Step 3 depends on the actual capture-accumulator name and `LogBuffer.reset()` existing — read the file first; Task 5 Step 4 validates the nmap exit-code assumption that the whole nmap/masscan inclusion rests on.
- **Out of scope:** sub-project #3 (cockpit merge); no parser or `build()` changes; per-tool images remain as fallback.
