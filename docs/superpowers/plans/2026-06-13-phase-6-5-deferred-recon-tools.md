# Phase 6.5 — Deferred Recon Tools — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox steps.

**Goal:** Add the tools deferred from 6.2–6.4 — `theHarvester` (emails), `sslscan` (weak-TLS findings), `gobuster` (endpoints) — reusing existing entities/channels. **No Prisma migration, no GraphQL, no frontend.**

**Architecture:** Each tool = `libs/scanners/<name>` + a `libs/parsers/src/<name>` parser feeding an EXISTING `NormalizedOutput` channel (`emails` / `findings` / `endpoints`), already persisted by the existing persisters. New tools are appended as steps to the existing `osint-passive` / `web-fingerprint` / `web-content` templates. Builds on 6.1–6.4.

**Tech Stack:** Nx · NestJS · Zod · Docker · Jest.

## Refined design (6.5)
1. **theHarvester** (custom python image) → emails via `out.emails` (reuses `EmailPersister`). Added to `osint-passive`.
2. **sslscan** (alpine `sslscan` pkg, custom image) → weak-protocol/cipher `out.findings` (reuses `FindingPersister`). Finding `location` MUST be URL-form (`https://<host>`) — same contract as tlsx. Added to `web-fingerprint`.
3. **gobuster** (custom Go image, bundled wordlist) → `out.endpoints` (reuses `EndpointPersister`). gobuster emits relative paths; the parser joins them onto `ctx.target` (available on `ParserContext`). Added to `web-content`.
4. **censys deferred** (needs a 2-secret credential model — separate design).
5. No schema/GraphQL/frontend changes. e2e: extend the existing opt-in suites' assertions where cheap; otherwise the existing suites already exercise the templates these steps join.

---

## Task 1: theHarvester scanner + parser

- [ ] **Dockerfile** `docker/scanners/theharvester/Dockerfile`: `FROM python:3.12-slim`, `pip install --no-cache-dir theHarvester` (or `git clone` + pip install if the pypi pkg name differs — verify; the pypi package is `theHarvester`), non-root user 10001, `ENTRYPOINT []`. Add `autoscanner/theharvester:1.0` to `tools/scanners/build-images.sh`.
- [ ] **Scaffold** `libs/scanners/theharvester/` (scanners-theharvester) from the assetfinder config + tsconfig.base path.
- [ ] **TDD + scanner** `theharvester.scanner.ts`: name `theharvester`, displayName `theHarvester`, category `[OSINT, PASSIVE_RECON]`, image `autoscanner/theharvester:1.0`, readonlyRootfs false, defaultTimeoutMs 300_000, input `z.object({})`, build → `{ cmd: ['theHarvester', '-d', target, '-b', 'crtsh,duckduckgo,bing,otx', '-f', '/dev/stdout', '--json'] }` (writes JSON to /dev/stdout; verify the flag — theHarvester uses `-f <file>` for output; if `--json`/stdout isn't supported cleanly, capture stdout text and parse emails by regex instead — keep the parser tolerant). outputs `[{format:'JSON', capture:'stdout', parser:'theharvester-json'}]` (or TEXT + a regex parser if JSON-to-stdout isn't reliable — implementer's call, document it), produces `['Email']`. Module + index.
- [ ] **TDD + parser** `libs/parsers/src/theharvester-json/`: parse theHarvester output, extract `emails` (array of strings in the JSON, or via email regex over text) → `out.emails.push({address: lower})` deduped. Tolerant (empty/invalid → empty). Fixture with 2 emails. Register (4 spots) + index.
- [ ] **Register** in AllScannersModule + `'theharvester'` in aggregator spec.
- [ ] **Add to `osint-passive` template**: append `{ scannerName: 'theharvester', inputs: {}, target: { kind: 'context', path: 'target' } }`. Update `osint-passive.spec.ts` (now 3 steps: crtsh, whois, theharvester) + `builtins.spec.ts` if it asserts step counts.
- [ ] `pnpm nx test scanners-theharvester parsers scanners-all templates` → green. **Commit** `feat(phase-6.5): add theHarvester scanner + parser`.

---

## Task 2: sslscan scanner + parser

- [ ] **Dockerfile** `docker/scanners/sslscan/Dockerfile`: `FROM alpine:3.20`, `apk add --no-cache sslscan ca-certificates`, non-root user 10001, `ENTRYPOINT []`. Add `autoscanner/sslscan:1.0` to build-images.sh.
- [ ] **Scaffold** `libs/scanners/sslscan/` (scanners-sslscan) + tsconfig path.
- [ ] **TDD + scanner** `sslscan.scanner.ts`: name `sslscan`, displayName `sslscan`, category `[SSL_TLS]`, image `autoscanner/sslscan:1.0`, readonlyRootfs true, defaultTimeoutMs 300_000, input `z.object({})`, build → `{ cmd: ['sslscan', '--no-colour', target] }` (sslscan accepts host or host:port; default 443). outputs `[{format:'TEXT', capture:'stdout', parser:'sslscan-text'}]`, produces `['Finding']`. Module + index.
- [ ] **TDD + parser** `libs/parsers/src/sslscan-text/`: parse sslscan's text output for weak signals and emit `out.findings` (scannerName `'sslscan'`, **location `https://${ctx.target}`** so the worker can resolve the asset — same contract fixed for tlsx):
  - lines indicating `SSLv2`/`SSLv3`/`TLSv1.0`/`TLSv1.1` **enabled** → `{title: 'Weak SSL/TLS protocol enabled: <proto>', severity: 'MEDIUM'}`.
  - cipher lines containing `RC4`/`NULL`/`EXPORT`/`DES` (weak ciphers accepted) → `{title: 'Weak cipher supported: <cipher>', severity: 'LOW'}` (cap to avoid flooding — e.g. dedupe by title).
  Fixture = a trimmed sslscan text output containing an `Accepted ... SSLv3 ...` line + an `Accepted ... RC4 ...` line + strong lines that must NOT produce findings. Tolerant; empty input → empty. Register (4 spots) + index. The parser uses `ctx.target` for the finding location.
- [ ] **Register** in AllScannersModule + `'sslscan'` in aggregator spec.
- [ ] **Add to `web-fingerprint` template**: append `{ scannerName: 'sslscan', inputs: {}, target: { kind: 'context', path: 'subdomains' } }`. Update `web-fingerprint.spec.ts` (now 4 steps) + builtins.spec.
- [ ] `pnpm nx test scanners-sslscan parsers scanners-all templates` → green. **Commit** `feat(phase-6.5): add sslscan scanner + parser`.

---

## Task 3: gobuster scanner + parser

- [ ] **Dockerfile** `docker/scanners/gobuster/Dockerfile`: two-stage golang build of `github.com/OJ/gobuster/v3@latest`, final alpine + ca-certificates + bundled `/etc/gobuster/content.txt` wordlist (copy `docker/scanners/gobuster/wordlist.txt` — reuse the ~25-path list from ffuf's wordlist), non-root user. Add `autoscanner/gobuster:1.0` to build-images.sh.
- [ ] **Scaffold** `libs/scanners/gobuster/` (scanners-gobuster) + tsconfig path.
- [ ] **TDD + scanner** `gobuster.scanner.ts`: name `gobuster`, displayName `gobuster`, category `[WEB_ENUM]`, image `autoscanner/gobuster:1.0`, readonlyRootfs true, defaultTimeoutMs 300_000, input `{ wordlist: z.string().default('/etc/gobuster/content.txt') }`, build → `{ cmd: ['gobuster','dir','-u',`https://${target}`,'-w',input.wordlist,'-q','--no-color','-o','/dev/stdout'] }`. outputs `[{format:'TEXT', capture:'stdout', parser:'gobuster-text'}]`, produces `['Endpoint']`. Module + index.
- [ ] **TDD + parser** `libs/parsers/src/gobuster-text/`: gobuster `-q` output lines look like `/admin                (Status: 200) [Size: 1234]`. Parse each line: extract the path (first token starting with `/`) and the `Status: NNN`; build the full URL by joining the path onto `ctx.target` (`new URL(path, ctx.target.startsWith('http') ? ctx.target : 'https://' + ctx.target).href`), push `out.endpoints.push({ url, method: 'GET', statusCode })`. Skip non-matching lines; tolerant. Fixture with 2 result lines + a noise line. Register (4 spots) + index.
- [ ] **Register** in AllScannersModule + `'gobuster'` in aggregator spec.
- [ ] **Add to `web-content` template**: append `{ scannerName: 'gobuster', inputs: {}, target: { kind: 'context', path: 'subdomains' } }`. Update `web-content.spec.ts` (now 5 steps) + builtins.spec.
- [ ] `pnpm nx test scanners-gobuster parsers scanners-all templates` → green. **Commit** `feat(phase-6.5): add gobuster scanner + parser`.

---

## Task 4: README + CI + cleanup

- [ ] **README** — extend each phase subsection (6.2 web-content gains gobuster; 6.3 osint gains theHarvester; 6.4 fingerprint gains sslscan), noting they reuse the existing Endpoint/Email/Finding surfaces.
- [ ] **CI** — confirm `pnpm scanners:build` builds the 3 new custom images (it will once the build-images.sh lines are added). No new step.
- [ ] **Cleanup (flagged 3×):** extract the duplicated `formatDate` helper into `apps/frontend/src/lib/format-date.ts` and import it in `engagement-endpoints-tab.tsx`, `engagement-osint-tab.tsx`, `engagement-tls-tab.tsx`, `settings/api-keys-panel.tsx`. Run `pnpm nx test frontend` → green.
- [ ] **Commit** `chore(phase-6.5): docs + shared formatDate util`.

---

## Final verification
```bash
pnpm nx run-many -t test --projects=scanners-theharvester,scanners-sslscan,scanners-gobuster,scanners-all,parsers,templates,frontend
pnpm nx run-many -t type-check --projects=scanners-theharvester,scanners-sslscan,scanners-gobuster
pnpm lint
```

## Self-Review notes
- **Reuse-only:** no migration/GraphQL/frontend-data changes — all three tools feed existing channels + persisters.
- **Finding location contract:** sslscan findings use `https://<host>` (the tlsx bug fixed in 6.4 — bare host is dropped by the worker).
- **censys deferred:** needs a 2-secret credential model; out of scope here.
