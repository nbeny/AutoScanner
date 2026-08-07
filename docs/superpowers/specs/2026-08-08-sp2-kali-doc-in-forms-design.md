# SP2 — Kali doc in scanner option forms

**Date:** 2026-08-08
**Status:** Draft

## Program context

Last sub-project of the Kali tool catalog program (SP1 acquisition + SP3 runner done). SP1 added a
`kaliToolRef` cross-link on `scannerCatalog` (scanner → underlying Kali binary) but nothing surfaces
it. SP2 uses it to show each scanner's real Kali doc (help/man, homepage, options) next to its
structured option form on the "Run a scan" page — the "know its manual" idea, applied to the 120
scanners.

## Problem

`scan-run-page.tsx` renders `ScannerOptionsForm` (Zod-derived fields), but the operator has no view
of the underlying tool's actual `-h`/man help. The data exists: `scannerCatalog.kaliToolRef` +
`kaliTool(binary)` (from SP1). The frontend just doesn't request/use it.

## Goals

- Surface `kaliToolRef` on the frontend `scannerCatalog` query + type.
- A reusable `KaliToolDocPanel({ binary })` that queries `kaliTool(binary)` and renders the tool's
  description, homepage link, collapsible `helpTextRaw`, and its best-effort option list.
- Show it on the scan run form when the selected scanner has a `kaliToolRef`.

## Non-goals (YAGNI)

- No backend changes (SP1 already exposes `kaliToolRef` + `kaliTool`).
- No auto-insertion of Kali flags into the scanner's structured options (the two option models
  differ; the panel is reference/doc only).
- No new page — reuse the existing run form.

## Design

### 1. Query + type

- `SCANNER_CATALOG_QUERY` (`lib/graphql/queries.ts`): add `kaliToolRef` to the selection.
- `ScannerCatalogEntry` (`features/scans/scanner-catalog.ts`): add `kaliToolRef?: string | null`.

### 2. `KaliToolDocPanel` (`features/scans/kali-tool-doc-panel.tsx`)

`useQuery(KALI_TOOL_QUERY, { variables: { binary } })` (op already added in SP3b). Renders, inside a
collapsible `<details>` labelled "Doc Kali / aide" (closed by default):
- `displayName` + homepage link (`rel="noopener noreferrer"`, new tab) when present.
- `description`.
- `helpTextRaw` in a scrollable `<pre>` (when present).
- the `options[]` (flag + argHint + description) as a compact reference list (when present).
Loading/absent → nothing (or a subtle "…"). The panel is self-contained; the scanner form's own
Zod-driven inputs are unchanged.

### 3. Wiring (`features/scans/scan-run-page.tsx`)

When `selectedEntry?.kaliToolRef` is truthy, render `<KaliToolDocPanel binary={selectedEntry.kaliToolRef} />`
below the options block (inside the run-scan form's full-width column).

## Testing

- **`KaliToolDocPanel`** — renders description + homepage + help + an option, from a mocked
  `KALI_TOOL_QUERY`; renders nothing meaningful when `kaliTool` is null.
- **Query/type** — covered by the frontend type-check + existing scan-run-page test still green.
- **scan-run-page** — (light) the panel appears when the selected entry has a `kaliToolRef` (can be
  added to the existing scan-run-page test or a focused one).

## Rollout

Additive frontend only. No API/schema change. Value appears once the SP1 dataset is generated
(`pnpm kali:catalog`) so `kaliTool(binary)` returns real help; with the 3-tool seed, only
nmap/nikto/ffuf-mapped scanners show a populated panel (others: `kaliToolRef` resolves only if the
binary is in the dataset, else null → no panel).
