# Kali-as-Scanner — SP1: Fusion Kali→scanner + pipeline brut

Date: 2026-08-11
Status: approved (design), pending plan
Program: "Kali becomes the scanner" — unify the 852 Kali catalog tools into the
scanner system and drop the structured findings pipeline.

## Motivation

Sub-project #3b only added a curated Kali launcher **inside the cockpit command
bars**; the Kali tools never became first-class entries in the scanner system.
The operator wants the opposite of the current split: **Kali IS the scanner**.
Every Kali tool appears in the scanner catalog, runs through the normal
`runScan` pipeline, and is usable in templates and AutoHunt — executed by the
single `kali-toolbox` container, with **raw output and no findings**.

## Locked decisions (from brainstorming, 2026-08-11)

| Topic | Decision |
| --- | --- |
| Scope | **All 852** dataset tools become scanners (not a curated subset). |
| Collisions | **Kali always wins.** No structured scanner drives runs anymore; one entry per binary. |
| Exposure | Generated Kali scanners are usable in `runScan` **+ templates + AutoHunt**. |
| Run examples | Editable quick-run examples per command (SP2), cascade **seed > man EXAMPLES > generic fallback**. |
| Findings | **All raw.** Structured parsing is removed. No correlation / risk / CVE. AutoHunt runs on its degraded methodology (it can select + launch tools, but has no findings to reason on). |
| Deletion mode | **Delete, not disable** — no dead code (git history preserves it). |

### Consequence (accepted by the operator)

The platform pivots from a "normalized findings engine" to an **Exegol-style
unified Kali runner** integrated into the scanner catalog + templates +
AutoHunt. Correlation, risk scoring, CVE enrichment, and the AutoHunt
findings-based world state become obsolete and are removed (see SP4).

## Program decomposition (each: spec → plan → impl)

- **SP1 (this spec)** — Kali→scanner factory + raw pipeline. End state: catalog =
  852 tools, `runScan` runs any Kali binary raw, end to end.
- **SP2** — Editable quick-run examples (presets cascade seed>man>fallback),
  surfaced as editable chips in the existing composer.
- **SP3** — Migrate templates + AutoHunt to the generic schema; remove the now-
  redundant `/runner` page and cockpit `kali` mode.
- **SP4** — Delete the findings stack (code first, Prisma schema last as a
  dedicated migration).

Templates and the AutoHunt decision validator reference structured scanners that
this program removes; they **break** between SP1 and SP3. This is expected and
sequenced — SP3 fixes them.

---

## SP1 architecture

### 1. Kali scanner factory — `libs/scanners/kali-generated/`

`buildKaliScanners(dataset: KaliToolRecord[]): ScannerDefinition[]` iterates
`data/kali-tools.json` (852 records) and produces one `ScannerDefinition` per
binary:

- `name` = `record.binary`; `displayName` / `description` from the dataset.
- `category` — via `KALI_CATEGORY_TO_SCANNER_CATEGORY: Record<string,
  ScannerCategory>` mapping the 25 Kali categories onto the `ScannerCategory`
  enum. The enum does not cover the full Kali taxonomy, so SP1 **adds** enum
  values to reach full coverage: `EXPLOITATION`, `POST_EXPLOITATION`,
  `FORENSICS`, `REVERSE_ENGINEERING`, `MISC`. Any unmapped category falls back to
  `MISC`. `primaryCategory` = first mapped category.
- `inputSchema` — a single shared generic Zod schema
  `KaliScannerInput = { target?: string; args?: string; preset?: string }`.
  All fields optional (some tools take no target; `args` is a **freeform string**
  — the argv tail — tokenized argv-safe at build time, matching the existing
  `extraArgs` convention and avoiding array-field rendering issues in the
  catalog; `preset` selects a SP2 example, inert in SP1).
- `docker: ScannerDockerSpec`:
  - `image` = `KALI_TOOLBOX_IMAGE` (`@autoscanner/common`).
  - `network: 'bridge'`.
  - `capabilities` — minimal by default (`[]`), overridden per-binary via
    `KALI_TOOL_CAPS: Record<string, string[]>` for raw-socket tools
    (nmap, masscan, arp-scan, … → `['NET_RAW', 'NET_ADMIN']`).
  - `readonlyRootfs: true`, default `memoryLimitMb`, `cpuQuota`,
    `defaultTimeoutMs` (reuse the toolbox/runner defaults).
  - no `fallbackImage` (per-tool images are gone).
- `build(input, target, ctx): BuildResult` → `{ cmd: [binary, ...argv] }` where
  `argv` = `tokenizeArgs(input.args)` (whitespace split honoring single/double
  quotes; no shell). Target placement rule (argv-only): if any token equals the
  literal `{{target}}` it is replaced by `target`; otherwise, when `target` is
  non-empty, `target` is appended as the final argv element. Output captured from
  stdout.
- `outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'raw' }]`.
- `produces: []`. `requiresCredential: undefined`. `version` = dataset
  `kaliRelease`.

`libs/scanners/all/src/all-scanners.module.ts` is reduced to register the
factory output instead of importing the 120 structured scanner modules.

### 2. Raw parser — `libs/parsers/src/raw.parser.ts`

Registered in the parser registry under the name `'raw'`. `parse(raw, ctx)`
returns **zero entities and zero findings**; it only finalizes the job. The raw
bytes were already written to MinIO by scan-worker and stay downloadable from the
run-detail view. The parser exists solely so `parser-worker` can resolve a parser
by name and mark the scan COMPLETED without special-casing.

### 3. Execution — scan-worker

Every generated definition already targets `KALI_TOOLBOX_IMAGE`, so
`docker-runner` uses it directly. The SP#2 `KALI_TOOLBOX_ALLOWLIST` routing /
image-swap logic in `apps/scan-worker/src/app/kali-routing.ts` becomes
**dead** and is removed — there is a single execution path: everything runs in
`kali-toolbox`.

### 4. End-to-end flow (structurally unchanged)

```
runScan(scannerName=binary, target, optionsJson={args,preset})
  → Scan + ScanJob rows (atomic) + Kafka security.scanner.requested
  → scan-worker: resolve generated def → build() argv → run kali-toolbox
      → stream logs to Redis → store raw stdout → MinIO
      → publish security.parse.requested
  → parser-worker: parser 'raw' (0 findings) → Scan COMPLETED
  → run-detail view shows / downloads the raw output
```

### 5. `scannerCatalog`

Returns the 852 automatically — `ScannerCatalogService.catalog()` maps
`ScannerRegistry.list()`. `kaliToolRef` resolves to the binary itself (the doc
panel is already wired to it). No frontend change is required for SP1; the real
catalog/search work is SP3.

## Known limitation (documented, not blocking)

Raw-socket tools can exit **126** inside the hardened toolbox despite `NET_RAW`
(observed on nmap in SP#2, when a per-tool fallback image still existed — it no
longer does). `KALI_TOOL_CAPS` mitigates the common cases; residual failures are
an accepted limitation. Tightening/loosening the toolbox hardening is deferred to
SP-cleanup.

## Testing

- **factory** (pure unit): dataset → 852 well-formed defs; `name === binary`;
  `docker.image === KALI_TOOLBOX_IMAGE`; category mapping incl. `MISC` fallback;
  `KALI_TOOL_CAPS` applied (nmap gets `NET_RAW`); spot-check nmap / whois /
  dnsenum `build()` argv.
- **raw parser** (unit): returns 0 findings / 0 entities; finalizes.
- **integration**: `runScan whois example.com` → COMPLETED with raw output
  stored (docker-runner mocked at the scan-worker boundary).
- **registry/catalog**: `scannerCatalog` returns the generated set; a generated
  entry validates against the shared generic schema.

## Out of scope (SP1)

- Quick-run examples / presets content (SP2).
- Template + AutoHunt migration to the generic schema (SP3).
- Deleting the structured scanner libs, parsers, correlation/CVE, and the Prisma
  findings schema (SP4).
- Any catalog/search UI redesign for 852 entries (SP3).
