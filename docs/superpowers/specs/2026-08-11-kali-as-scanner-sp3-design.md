# Kali-as-Scanner — SP3: Migrate templates + AutoHunt, remove redundant Kali run path

Date: 2026-08-11
Status: approved (design), pending plans
Depends on: SP1 (done — all scanners are generic raw Kali tools, input `{target?, args?, preset?}`, zero findings).

## Why

After SP1, parsers are gone, so nothing populates the discovery entity tables
(Subdomain/IpAddress/Url/Endpoint/Email) or findings. Two subsystems built on
those are now broken or meaningless, and one subsystem is now redundant:

- **Templates** — steps carry structured `inputs` keyed on per-scanner option
  names, and the orchestrator fans out over discovered entities. Both are dead:
  option keys are stripped by the generic schema, discovery tables are empty, and
  several referenced scanners (httpx, subfinder, dnsx, naabu, nuclei, subzy,
  alterx, xss-scan, sqli-scan, cmdi-scan, whois) are **not** Kali binaries so
  `registry.get()` throws.
- **AutoHunt** — `world-state` reads parser-produced entities/findings → empty;
  Claude decides blind.
- **Kali run path** (`/runner`, `runKaliTool`, `kali-runs`, `kali-tool-worker`,
  cockpit `kali` mode) — now duplicates `runScan`, since every Kali tool is a
  normal scanner.

## Locked decisions (brainstorming 2026-08-11)

| Area | Decision |
| --- | --- |
| Templates | **Linear playlists** — rewrite builtins as sequences of verified Kali tools run on the root target with `args`; drop discovery fan-out. |
| AutoHunt | **Feed raw output to Claude** — world-state includes truncated stdout of prior runs (from MinIO), so Claude reasons on real output. |
| Cleanup | **Delete the Kali execution path**, keep the `kaliTools`/`kaliTool` catalog + doc panel. |

## Sub-plans (each spec-section → its own plan → impl)

SP3 ships as three independent plans, executed in order: **3a templates**,
**3b AutoHunt**, **3c cleanup**.

---

## SP3a — Templates as linear playlists

### Type change

`libs/templates/src/types.ts`: `TemplateStep` becomes
`{ scannerName: string; args?: string; preset?: string; requiresCapability?: string }`.
Remove `inputs: Record<string, ContextRef>` and `target: ContextRef`. Remove the
`ContextRef` type and the discovery paths. Target is always the run's root target.

### Orchestrator simplification (`apps/orchestrator-worker/src/app`)

- `step-executor.service.ts`: drop `extractStaticInputs`; a step's child ScanJob
  input becomes `{ args?: step.args, preset?: step.preset }` (omit undefined),
  target = `run.target` for every step.
- `context-builder.service.ts`: reduce to a single responsibility — return
  `[run.target]` for every step (no DB entity queries). All `prisma.subdomain/
  ipAddress/endpoint/email` reads removed.

### Rewrite builtins (`libs/templates/src/builtins`)

Replace the 27 findings-oriented builtins with a small curated set of linear
playlists using binaries **verified present in `data/kali-tools.json`**. Proposed
set (each step `{scannerName, args}`, target auto-appended):

- `recon-passif` — `dmitry -winsepfb`, `theharvester -b all`, `dnsenum`
- `recon-domaine` — `amass enum -passive`, `dnsrecon -d {{target}}`, `fierce --domain {{target}}`
- `web-surface` — `whatweb`, `wafw00f`, `nikto -host {{target}}`
- `web-contenu` — `dirb http://{{target}}`, `wpscan --url {{target}}`
- `tls` — `sslscan`, `sslyze`
- `reseau` — `nmap -sV -Pn`, `masscan -p1-65535 --rate 1000`
- `smb-windows` — `enum4linux`, `smbmap -H {{target}}`
- `snmp` — `onesixtyone`, `snmp-check`

(Exact `args` finalized in the plan; each binary confirmed in the dataset.) Keep
`requiresCapability` where an active-scan gate is warranted.

### Seed

`prisma/seed.ts` persists builtins → update to seed the new playlists.

### Tests

- `TemplateStep` type + a sample builtin shape.
- step-executor: a step yields child input `{args}` and target = root.
- context-builder: every path returns `[run.target]`.

---

## SP3b — AutoHunt fed by raw output

### World state (`apps/ai-orchestrator-worker/src/app/world-state.service.ts`)

Replace finding/asset/port/service/technology/endpoint queries with:

- `scannersRun` (keep — from `scanJob`).
- `recentOutputs: { scanner, target, excerpt }[]` — for the last K completed
  scan jobs of the run, download the raw stdout artifact from MinIO (via the
  artifact key on the Scan/ScanJob) and truncate each to a cap (e.g. 4 KB). This
  requires injecting the storage client into the worker (add the storage module
  if not already present).
- `entities-loader.service.ts` (ChainDecider) similarly drops entity reads; it
  either returns empty resolvable sets or is removed if only used for dead fan-out.

WorldState type updated; all consumers adjusted.

### Decision prompt (`decision-prompt.ts`, `scanner-catalog.ts`)

- The catalog is now 852 generic tools — too large for the prompt. Cap it:
  `buildScannerCatalog` returns compact `{name, description, primaryCategory}`
  and `catalogToPromptText` presents a **capped, category-grouped shortlist**
  (≈60 tools, recon/web/vuln-leaning) with a note that more exist; Claude may
  name any registered binary.
- Replace the "provide inputs matching listed input keys" instruction with:
  "Set `args` to the tool's CLI flags (a string). The target is auto-appended;
  use the literal `{{target}}` if the tool needs the target mid-command."
- Inject `recentOutputs` excerpts into the user prompt so Claude reasons on the
  actual tool output.

### Decision validator (`decision-validator.ts`)

Validate the chosen scanner via `registry.has(name)` and `inputSchema.safeParse`
(generic schema — already accepts `{args, preset}` and strips extras). Remove any
per-option-key expectations. Keep guardrails unchanged.

### Dispatch

`ai-run.processor.ts` → `ScanDispatcher` sends `input = { args }` (+ target).
No structural change beyond the input shape.

### Tests

- world-state builds `recentOutputs` excerpts from a mocked storage client
  (truncation + cap honored).
- decision-prompt includes an excerpt + the capped catalog.
- decision-validator accepts a generic `{args}` decision, rejects an unknown
  scanner name.

---

## SP3c — Remove the redundant Kali execution path

Delete code (Prisma `KaliToolRun` model left for the SP4 schema pass; git history
preserves everything):

**Frontend** (`apps/frontend/src`)
- Routes `/runner` + `/runner/:runId` (`app-routes.tsx`), nav "Runner"
  (`nav-rail.tsx`).
- `features/runner/*` (whole folder).
- Cockpit `kali` mode: remove `'kali'` from `LaunchMode` and its branches in
  `cockpit-command-bar.tsx`; delete `kali-tool-launcher.tsx`,
  `kali-cockpit-catalog.ts`; remove the OSINT Kali launcher usage in
  `features/osint/osint-cockpit-page.tsx`.
- Remove `runKaliTool` + kali-run GraphQL docs from `lib/graphql/queries.ts`.

**Backend**
- Delete `apps/api-gateway/src/app/kali-runs/` and unwire it from the api-gateway
  app module.
- Delete the `apps/kali-tool-worker/` project; remove it from the `dev:workers`
  script (`package.json`).

**Keep**
- `kaliTools`/`kaliTool` queries (`tools.resolver.ts` + `kali-catalog.service.ts`)
  and the `KaliToolDocPanel` — they document each tool's help/options and stay
  useful in the scanner composer.

### Tests

- Update/remove tests that referenced deleted routes/components/resolvers.
- Confirm frontend build + api-gateway type-check pass with the deletions.

## Out of scope (SP3)

- Editable quick-run examples (SP2 — separate).
- Deleting the findings libs and Prisma schema, incl. `KaliToolRun` (SP4).
- Rebuilding discovery/fan-out on top of raw output (not planned; discovery is
  intentionally gone).
