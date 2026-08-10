# Scan Command Composer — Design (sub-project #1)

Date: 2026-08-10
Status: approved (design), pending implementation plan

## Context

This is the first of three sub-projects born from the request to make scanner
options usable ("le formulaire d'options est vraiment pas pratique") and to bring
the Kali-Runner experience into the scan launchers:

1. **Scan command composer** (this doc) — replace the typed-options form with a
   Kali-Runner-style composer: presets + clickable man-sourced options + live
   command preview + inline help.
2. Run scanners through the single Kali container when the tool exists in Kali
   (separate spec later).
3. Merge the Kali tool catalog into the Recon/OSINT cockpits by category
   (separate spec later).

Decisions locked during brainstorming:

- **Superposed model** — keep each scanner's typed Zod `inputSchema` and its
  parser. The typed options still drive the real command, so normalized findings,
  correlation, CVE enrichment and risk scoring are preserved. The composer is a
  friendlier layer on top, not a replacement.
- **Live command preview: yes**, computed server-side for 100% fidelity.
- **Typed fields: collapsed** into an "Options avancées" section; presets + the
  man-option palette lead the UI.

## Current state (what exists to build on)

- `ScannerOptionsForm` (`apps/frontend/src/features/scans/scanner-options-form.tsx`)
  renders the typed schema fields, curated `presets`, "souvent lancé" usage
  chips, and a raw `extraArgs` text field. It serializes everything to
  `optionsJson` via `onChange`. It already accepts a `registerAddFlag` callback
  that appends a flag to `extraArgs`.
- `KaliToolDocPanel` (`apps/frontend/src/features/scans/kali-tool-doc-panel.tsx`)
  already renders a tool's man/help-parsed options (`kaliTool(binary)`), each with
  `flag`, `argHint`, `description`, and an optional "+" that calls `onAddFlag`.
- The scanner catalog exposes `kaliToolRef` (computed name→binary link) and the
  Kali dataset (`data/kali-tools.json`, 88 tools) provides man-sourced options via
  the `kaliTool(binary)` query.
- `ScannerDefinition.build(input, target, ctx): BuildResult` where
  `BuildResult.cmd: string[]` is the argv and the image is `def.docker.image`.
  `BuildContext` needs `scanJobId`, `engagementId`, `scratchDir`, and optional
  `oast`/`auth`.
- Callers of `ScannerOptionsForm`: `cockpit-command-bar.tsx` and
  `scan-run-page.tsx` — both already hold the `target` string in state.

Non-obvious constraint: a scanner's `build()` always injects its own output-format
flags (e.g. `nmap -oX`) regardless of user options, and `extraArgs` are appended
verbatim (existing behaviour). So flags added via the man palette land in
`extraArgs` and do not break the parser's expected output format.

## Architecture

Two changes, isolated units:

### A. Backend — `previewScanCommand` query (pure, non-executing)

GraphQL:

```graphql
type ScanCommandPreview {
  image: String!
  argv: [String!]!
  note: String
}

previewScanCommand(
  scannerName: String!
  target: String!
  optionsJson: String
): ScanCommandPreview!
```

Service logic (`preview-scan-command`, co-located with the scans resolver in the
scans module — it reuses the same `ScannerRegistry` the run path uses):

1. Resolve the `ScannerDefinition` from the registry. Unknown name → GraphQL error
   (`Scanner "<name>" not found`).
2. Parse `optionsJson` (default `{}` when empty). Validate/coerce through
   `def.inputSchema` (Zod). On validation failure, return a `note` describing the
   issue and fall back to `def.inputSchema.safeParse({})`'s data when possible so a
   partial preview still renders; otherwise surface the error.
3. Build a **stub `BuildContext`**: `{ scanJobId: 'preview', engagementId:
   'preview', scratchDir: '/preview', oast: { serverUrl: '{{OAST}}' }, auth: {} }`.
4. Call `def.build(input, target, ctx)`; return
   `{ image: def.docker.image, argv: result.cmd }`.
5. Wrap `build()` in try/catch. If it throws (e.g. a required credential the stub
   ctx lacks), return `{ image: def.docker.image, argv: [], note: '<message>' }` —
   e.g. `Nécessite une clé API (SHODAN)` when `def.requiresCredential` is set.

Guarantees: no Docker call, no credential decryption, no side effects. Injected
credential **values** are never part of `cmd` (they go through env), so the argv is
safe to display.

DTO validation note (project invariant): the query takes scalar args, not an input
object, so no class-validator DTO is required. If refactored to an `@InputType`,
every field must carry a class-validator decorator.

### B. Frontend — `ScannerOptionsForm` rewritten as a composer

Same public contract: `onChange(optionsJson)` unchanged, plus one new prop
`target: string` (for the preview). Layout, top to bottom:

1. **Header** — `displayName`, `description`, `homepage`, and the existing
   credential warning when `requiresCredential` is set.
2. **Presets** — curated `entry.presets` and "souvent lancé" usage chips (kept
   from today), presented as the primary quick-start.
3. **Man-option palette** (`ManOptionPalette`, new component) — chips from
   `kaliTool(kaliToolRef).options`: `flag argHint` with `description` on hover,
   plus a search filter when the list is long. Clicking a chip appends the flag to
   `extraArgs`. Renders nothing when the scanner has no `kaliToolRef` or the binary
   is not in the dataset (fallback to typed fields only).
4. **Command preview** — a mono box showing `image` + `argv`, driven by
   `useScanCommandPreview(scannerName, target, optionsJson)` (debounced ~300ms).
   Shows the `note` (e.g. credential required) when present.
5. **Arguments bruts** — the existing `extraArgs` text field (the palette feeds it;
   manual typing still allowed).
6. **Options avancées** (collapsible, closed by default) — the current typed-field
   grid (`renderControl`) for precise control.
7. **Aide / man** (collapsible) — the existing `KaliToolDocPanel`.

### Units and boundaries

- `preview-scan-command` service + resolver (backend) — input: scanner name,
  target, optionsJson; output: `{ image, argv, note }`; depends on the registry
  only. Pure.
- `useScanCommandPreview(scannerName, target, optionsJson)` (frontend hook) —
  debounced Apollo query; returns `{ image, argv, note, loading }`.
- `ManOptionPalette({ binary, onAddFlag })` (frontend) — self-contained; depends on
  the `kaliTool` query.
- The composer assembles header + presets + palette + preview + extraArgs +
  advanced grid + help. Its `optionsJson` serialization is unchanged from today.

## Data flow

Composer state (typed values + enabled toggles + `extraArgs`, as today) →
serialized `optionsJson` via `onChange` (unchanged) **and** fed into
`useScanCommandPreview(scannerName, target, optionsJson)` → server calls `build()`
with a stub ctx → preview box renders `image` + `argv`. Man-palette clicks and
preset applications mutate the same state, so the preview stays in sync.

## Error handling

- Unknown scanner → GraphQL error surfaced inline in the preview box.
- `build()` throws / missing credential → `note` shown, no crash.
- No `kaliToolRef` / binary absent from dataset → palette hidden; typed fields and
  preview still work.
- Preview query in flight → keep last preview, show a subtle "…" (no layout jump).

## Testing

Backend (`preview-scan-command`):
- nmap with `{ports:'1-1000', serviceDetection:true}` → argv contains `-p 1-1000`
  and `-sV`, image = nmap's docker image.
- A `requiresCredential` scanner with no key → `note` set, no throw.
- Unknown scanner name → error.
- `extraArgs` present → appended verbatim to argv.

Frontend:
- Composer renders presets and the man palette for a scanner with `kaliToolRef`.
- Clicking a man chip appends its flag to `extraArgs` and the preview updates.
- "Options avancées" is collapsed by default and expands on click.
- Preview reflects the serialized `optionsJson` (mock `previewScanCommand`).
- Scanner without `kaliToolRef` → palette absent, typed fields still render.

## Out of scope (later sub-projects)

- Changing scanner execution to the single Kali container (#2).
- Reorganizing/merging the Kali tool catalog into the Recon/OSINT cockpits (#3).
- Any change to `build()` outputs, parsers, or the `optionsJson` contract.
