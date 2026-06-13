# Phase 6.6 — Censys — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox steps.

**Goal:** Add the `censys` scanner (the last deferred OSINT tool), reusing the Phase 6.3 encrypted-credential pipeline and the existing `OrgMetadata` channel.

**Architecture:** Mirrors `shodan` (key-gated OSINT → `OrgMetadata`). The only new wrinkle is censys needs **two** secrets (API id + secret); the existing `ApiCredential` model stores one sealed string per `(owner, provider)`, so the operator stores them **colon-joined** (`<id>:<secret>`), injected into one env var (`CENSYS_API_CRED`) by scan-worker, and the censys scanner's shell script splits it into `CENSYS_API_ID`/`CENSYS_API_SECRET` (which the censys CLI reads natively). **No pipeline change.** `ApiProvider.CENSYS` already exists.

## Refined design
1. **No schema/migration/GraphQL/frontend changes.** Reuses `ApiCredential`, `OrgMetadata`, `requiresCredential`/`credentialEnvVar`, `OrgMetadataPersister`.
2. Credential format: `setApiCredential(provider: CENSYS, secret: "<api_id>:<api_secret>")`. Split on the FIRST colon (censys API ids are UUIDs — no colons).
3. shodan stays standalone-only (not in a default template) because it's key-gated; censys likewise — runnable via `runScan` once a credential is set. Not added to `osint-passive` (which must stay key-free).

## Task 1: censys scanner + censys-json parser

- [ ] **Dockerfile** `docker/scanners/censys/Dockerfile`: `FROM python:3.12-slim`, `pip install --no-cache-dir censys`, non-root user 10001, `ENTRYPOINT []`. Add `autoscanner/censys:1.0` to `tools/scanners/build-images.sh` + echo.
- [ ] **Scaffold** `libs/scanners/censys/` (scanners-censys) from `libs/scanners/shodan/` config. tsconfig.base path `@autoscanner/scanners-censys`.
- [ ] **TDD + scanner** `censys.scanner.ts` (mirror shodan, incl. `shellQuoteSingle`): name `censys`, displayName `Censys`, category `[OSINT]`, image `autoscanner/censys:1.0`, readonlyRootfs false, defaultTimeoutMs 300_000, input `z.object({})`, `requiresCredential: 'CENSYS'`, `credentialEnvVar: 'CENSYS_API_CRED'`. build:
  ```typescript
  build(_input, target) {
    // CENSYS_API_CRED is injected as "<id>:<secret>" by scan-worker. Split it
    // into the env vars the censys CLI reads, then search hosts for the domain.
    const script =
      'export CENSYS_API_ID="${CENSYS_API_CRED%%:*}" CENSYS_API_SECRET="${CENSYS_API_CRED#*:}"; ' +
      `censys search ${shellQuoteSingle(target)} --index-type hosts -o /dev/stdout || true`;
    return { cmd: ['sh', '-lc', script] };
  }
  ```
  outputs `[{format:'JSON', capture:'stdout', parser:'censys-json'}]`, produces `['OrgMetadata']`. Module + index. Test asserts name/image/outputs/produces, `requiresCredential==='CENSYS'`, `credentialEnvVar==='CENSYS_API_CRED'`, and that `build` cmd is `['sh','-lc', <script>]` where the script contains `CENSYS_API_ID`, `CENSYS_API_SECRET`, `censys search`, and the shell-quoted target (add an injection test: a malicious target is single-quoted, no bare `; rm`).
- [ ] **TDD + parser** `libs/parsers/src/censys-json/`: parse the censys JSON output (an array of host results, or a `{ results: [...] }` object) tolerantly; push ONE `{ kind: 'ORG', data: parsed }` to `out.orgMetadata` (same shape as shodan-json — store the structured result). Invalid/empty → empty, no throw. Fixture = a small censys hosts-search JSON. Test: name `censys-json`, formats `['JSON']`; one ORG orgMetadata entry; invalid JSON → empty. Register (4 spots) + index.
- [ ] **Register** censys in AllScannersModule + `'censys'` in aggregator spec (now 22 scanners).
- [ ] **(image build best-effort)** skip if no Docker.
- [ ] `pnpm nx test scanners-censys parsers scanners-all` → green. **Commit** `feat(phase-6.6): add censys scanner + censys-json parser (key-gated)`.

## Task 2: docs
- [ ] **README** — in the Phase 6.3 OSINT subsection, add `censys` (custom image, key-gated). Document that censys credentials are stored colon-joined: `setApiCredential(provider: CENSYS, secret: "<api_id>:<api_secret>")`. Note both shodan + censys are standalone (run via `runScan`; not in `osint-passive` which is key-free).
- [ ] **Commit** `docs(phase-6.6): document censys + colon-joined credential format`.

## Final verification
```bash
pnpm nx run-many -t test --projects=scanners-censys,scanners-all,parsers
pnpm nx run scanners-censys:type-check
```

## Self-Review notes
- Reuse-only: no migration/GraphQL/frontend. censys mirrors shodan + the 2-secret split is contained in the scanner's shell script.
- Security: target shell-escaped (`shellQuoteSingle`); credential split from an env var (not interpolated); plaintext id/secret never logged (scan-worker injects `CENSYS_API_CRED` only).
