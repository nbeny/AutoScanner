# Scanners Run in the Kali Toolbox — Design (sub-project #2)

Date: 2026-08-10
Status: approved (design), pending implementation plan

## Context

Second of three sub-projects from the ask "tout outil dans kali utilise kali,
inutile d'avoir un container pour un outil qui est déjà dans kali linux". Instead
of pulling a dedicated per-tool image for every scanner, a scanner whose tool
already lives in the single `autoscanner/kali-toolbox:1.0` image should run
**inside that image**.

Sibling sub-projects (separate specs): #1 scan command composer (DONE, merged), #3
merge the Kali catalog into the Recon/OSINT cockpits (not started).

Decisions locked in brainstorming:

- **Verified opt-in allowlist** — a scanner runs in the toolbox only if it is on a
  central allowlist, and it joins that allowlist only after passing an end-to-end
  check (right binary + output still parses). No blanket auto-routing.
- **Migrate every present-and-verified tool** in this pass; tools that fail
  verification are listed explicitly and keep their own image (never silently
  dropped).
- **Original image stays as fallback.**

## Current state (what exists to build on)

- `scan-worker` (`apps/scan-worker/src/app/scan-job.processor.ts`) builds a
  `RunSpec` with `image: scanner.docker.image`, `cmd: injectExtraArgs(build.cmd,
  extraArgs)`, plus caps/network/memory from `scanner.docker`. It calls
  `this.docker.pullIfMissing(scanner.docker.image)` then `this.docker.run(runSpec)`.
- `this.docker.run()` returns `{ exitCode, ... }` (`libs/docker-runner`). A missing
  command yields container exit **127**, a non-executable one **126**.
- `build().cmd[0]` is the underlying binary name (e.g. `nmap`, `sqlmap`).
- The toolbox image constant `KALI_TOOLBOX_IMAGE = 'autoscanner/kali-toolbox:1.0'`
  lives in `apps/kali-tool-worker/src/app/kali-toolbox.ts`.
- Probe of the image confirmed present binaries: nmap, masscan, httpx (⚠ Python
  httpx, not ProjectDiscovery), nuclei, amass, nikto, whatweb, wafw00f, sslscan,
  sqlmap, dnsrecon, gobuster, ffuf, feroxbuster, wpscan, commix, onesixtyone,
  snmpwalk. Absent: naabu, subfinder, dalfox, enum4linux-ng, testssl.sh, kerbrute.

Non-obvious constraint: `kaliToolRef` (api-gateway catalog) resolves against the
**88-tool dataset**, not the full image, so only 3 scanners resolve today. This
sub-project keys off the **image**, not the dataset, via its own allowlist.

## Architecture

Two small runtime changes plus a verification effort:

### A. Shared constants — image + allowlist

Move `KALI_TOOLBOX_IMAGE` into a shared module both workers import (candidate:
`libs/common`; the plan will confirm its export surface), and add there:

```ts
export const KALI_TOOLBOX_IMAGE = 'autoscanner/kali-toolbox:1.0';

/** Scanners verified to run correctly inside the Kali toolbox image. */
export const KALI_TOOLBOX_ALLOWLIST: ReadonlySet<string> = new Set([
  // populated only with tools that pass end-to-end verification (Section C)
]);
```

`kali-tool-worker` re-exports/imports the moved constant (no behaviour change).

### B. Routing + fallback (scan-worker)

In `scan-job.processor`, choose the image from the allowlist and keep everything
else identical:

```ts
const useKali = KALI_TOOLBOX_ALLOWLIST.has(scanner.name);
const primaryImage = useKali ? KALI_TOOLBOX_IMAGE : scanner.docker.image;
await this.docker.pullIfMissing(primaryImage);
const runSpec: RunSpec = { image: primaryImage, /* …unchanged… */ };
let result = await this.docker.run(runSpec);

// Narrow fallback: 126/127 means the toolbox lacked/could-not-exec the binary —
// NOT a normal tool non-zero exit. Retry ONCE with the scanner's own image.
if (useKali && (result.exitCode === 126 || result.exitCode === 127)) {
  this.logger.warn(`scanner=${scanner.name} exit=${result.exitCode} in toolbox; falling back to ${scanner.docker.image}`);
  await this.docker.pullIfMissing(scanner.docker.image);
  result = await this.docker.run({ ...runSpec, image: scanner.docker.image });
}
```

The fallback condition is deliberately strict (126/127 only) so it never fires for
a scan that simply found nothing / returned a normal non-zero code.

### C. Populating the allowlist (the core work)

For each candidate binary present in the toolbox, verify end-to-end and add only on
success:

1. Run the scanner's real `build().cmd` inside `kali-toolbox` against a safe target.
2. Confirm it is the RIGHT tool (not a name collision) and completes.
3. Confirm the scanner's parser produces the expected entities from that output.

Pre-known exclusions (keep their own image, documented in the allowlist file):
- **httpx** — Kali ships the Python `httpx`, not ProjectDiscovery's; name collision.
- **nuclei** — depends on its templates; include only if present/current, else exclude.
- Absent binaries (naabu, subfinder, dalfox, enum4linux-ng, testssl, kerbrute).

Candidates to validate: nmap, masscan, sslscan, whatweb, wafw00f, nikto, dnsrecon,
gobuster, ffuf, feroxbuster, wpscan, sqlmap, commix, onesixtyone, snmpwalk, amass.
"All present tools" means all that pass; failures are listed as exclusions.

## Units and boundaries

- Shared constants module — `KALI_TOOLBOX_IMAGE`, `KALI_TOOLBOX_ALLOWLIST`.
- `scan-worker` routing/fallback — pure image-selection + one retry, no other change.
- Verification harness — a gated script/test that runs each candidate in the
  toolbox and checks its parser; drives which names go in the allowlist.

## Error handling

- Toolbox missing/failing the binary (126/127) → single fallback to the original
  image; the scan still completes.
- Allowlisted binary absent from the image → gated guard test fails in CI.
- Non-allowlisted scanners → unchanged (own image), zero risk.

## Testing

- Routing decision (unit): allowlisted scanner → `RunSpec.image === KALI_TOOLBOX_IMAGE`;
  non-allowlisted → `scanner.docker.image`.
- Fallback (unit on the processor): a mocked run returning exit 127 for an
  allowlisted scanner triggers exactly one retry with `scanner.docker.image`; a
  normal non-zero exit (e.g. 1) does NOT.
- Gated presence guard: every `KALI_TOOLBOX_ALLOWLIST` name's `build().cmd[0]` is on
  PATH in `kali-toolbox` (requires the image; skipped when absent).
- Parser spot-check for 1–2 migrated tools (e.g. nmap, sslscan): output captured
  from the toolbox parses into the same entity shape as before.

## Out of scope

- Sub-project #3 (merge Kali tools into the Recon/OSINT cockpits).
- Removing/rebuilding per-tool images (they remain as the fallback).
- Any change to scanner `build()`, parsers, or the composer from #1.
