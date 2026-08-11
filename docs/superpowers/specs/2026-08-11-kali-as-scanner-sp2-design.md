# Kali-as-Scanner — SP2: Editable quick-run examples per command

Date: 2026-08-11
Status: approved (design), pending plan
Depends on: SP1 (scanners are generic raw Kali tools with input `{target?, args?, preset?}`).

## Goal

Every scanner in the catalog offers one or more **editable quick-run examples**:
a named preset that prefills the composer's `args` field, which the operator can
edit before launching. Sourced via a cascade: **curated seed > man/help EXAMPLES
> generic fallback**.

## Why a cascade

- The generic Kali defs carry no `presets`, so `scannerCatalog` returns `[]` for
  them today.
- Man/help EXAMPLES exist for only some tools (nmap yes; nikto/sqlmap/dnsenum
  no), so parsing alone gives thin coverage.
- A hand-written seed gives high-quality examples for popular tools; a generic
  fallback (`just run on the target`) guarantees every tool has at least one.

## Architecture

### Backend — examples builder (`apps/api-gateway/src/app/tools/kali-examples.ts`)

Reuses the existing `ScannerPreset` type (`libs/scanner-sdk`, `{ id, name,
description, options }`) so the existing composer chip UI renders them unchanged.
Each example's `options` is `{ args: string }`.

- `KALI_EXAMPLE_SEED: Record<string, { name: string; args: string }[]>` — curated
  examples for ~25-40 popular binaries (nmap, nikto, whatweb, wafw00f, sqlmap,
  dnsenum, dnsrecon, fierce, wpscan, dirb, sslscan, sslyze, masscan, enum4linux,
  smbmap, snmp-check, onesixtyone, theharvester, amass, dmitry, …). Args use the
  `{{target}}` token where the tool needs the target mid-command, else empty/flags
  (target auto-appended). Every seed binary must exist in `data/kali-tools.json`.
- `parseManExamples(text: string | null, binary: string): { name: string; args: string }[]`
  — best-effort: find an `EXAMPLES` section or lines with a shell prompt
  (`#`/`$`) invoking the binary; strip the prompt + leading `binary`; keep the
  remaining args. Cap to ~3, dedupe, ignore output-looking lines. Returns `[]`
  when nothing parseable.
- `buildKaliExamples(record: KaliToolRecord): ScannerPreset[]` — cascade:
  1. seed for `record.binary` if present;
  2. else `parseManExamples(record.manTextRaw ?? record.helpTextRaw, binary)`;
  3. else a single generic fallback `{ name: 'Défaut', description: 'Lancer sur
     la cible', options: { args: '' } }`.
  Map each `{name, args}` to `ScannerPreset { id: kebab(name), name, description,
  options: { args } }`.

### Wire into the catalog (`scanner-catalog.service.ts`)

`presets:` becomes: if `scanner.presets?.length` use them (future-proofing); else
`buildKaliExamples(this.kali.findByBinary(scanner.name))` (fall back to `[]` when
the record is missing). The service already injects `KaliCatalogService`; use its
record lookup (add a method returning the full `KaliToolRecord` if only a boolean
`findByBinary` exists).

### Frontend (`features/scans/scanner-options-form.tsx`)

The preset chips + `applyPreset` already merge `options` into the form. Verify
`applyPreset` writes `options.args` into the generic `args` field and that the
value stays editable. Relabel the presets section to "Exemples de run" (examples
are the primary preset source now). No structural change expected.

### Fix pre-existing spec

`scanner-catalog.service.spec.ts` currently fails to compile (TS2739: mock
`KaliToolRecord` missing `manTextRaw`/`optionsSource`). Since SP2 touches this
service, fix the mocks and extend the spec to assert examples are emitted
(seed + fallback cases).

## Testing

- `parseManExamples`: extracts the nmap `# nmap -A -T4 …` example → `args:'-A -T4
  {{target}}'` (or `-A -T4` with target appended); returns `[]` for help text with
  no examples.
- `buildKaliExamples`: seed hit (nmap) → seed examples; no seed + man example →
  parsed; neither → the single generic fallback.
- catalog service: a generic scanner entry now carries non-empty `presets` with
  `options.args`.
- frontend: clicking an example chip fills the `args` field and it remains
  editable (extend the existing options-form test).

## Out of scope

- No new GraphQL field (reuse `presets`).
- No change to run execution (examples only prefill `args`, already handled by
  SP1's generic `build()`).
