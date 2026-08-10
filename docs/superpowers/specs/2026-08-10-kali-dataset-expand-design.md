# Kali Catalog Dataset Expansion — Design (sub-project #3a)

Date: 2026-08-10
Status: approved (design); capture running

## Context

Sub-project #3 is "merge the Kali tools into the Recon/OSINT cockpits by category".
On inspection the dataset couldn't support it: `data/kali-tools.json` held only 88
binaries, all from the `kali-tools-top10` metapackage (aircrack-ng, john, hydra,
metasploit… mostly offensive sub-binaries), all tagged `categories: ["top10"]` — no
usable category signal and almost no recon/OSINT tools.

Decision (brainstorming): **expand the dataset first** (#3a), then do the cockpit
merge (#3b) once real categories exist.

## Root cause (why the dataset was top10-only)

The toolbox image (`docker/Dockerfile.kali-toolbox`, `KALI_META=kali-linux-large`)
actually contains ~2940 binaries — the tools ARE there. But `kali-linux-large`
installs those tools as flat dependencies and registers only the
`kali-tools-top10` **metapackage**. The old `capture.sh` enumerated tools by
iterating installed `kali-tools-*` metapackages, so it only ever saw top10.

Kali's apt index exposes **29 category metapackages** (`kali-tools-information-gathering`,
`kali-tools-web`, `kali-tools-vulnerability`, `kali-tools-database`,
`kali-tools-passwords`, `kali-tools-wireless`, `kali-tools-exploitation`,
`kali-tools-sniffing-spoofing`, `kali-tools-forensics`, …). Their dependency lists
are the category source — and they can be **queried without installing them**.

## Approach

Rewrite the capture to derive categories by query and enumerate every installed
tool, keeping the installed set = `kali-linux-large` (so the dataset stays a subset
of the runtime toolbox — the dataset⇄image guard holds).

### `tools/kali-catalog/capture.sh` (rewritten)
1. Build a `package → category` map: for each `kali-tools-<cat>` in
   `apt-cache pkgnames kali-tools-`, read `apt-cache depends` (query only, no
   install); first category a package appears in wins.
2. Enumerate every INSTALLED package (`dpkg-query -W`); for those in the map, emit
   each `/usr/bin|/usr/sbin` executable with its help/man and `categories: [<cat>]`.
   Packages in no Kali category are skipped (filters system utilities).

Validated against `kalilinux/kali-rolling`: 29 metapackages present;
`kali-tools-information-gathering` → 0trace, arping, braa, dmitry, dnsenum, dnsmap,
dnsrecon, dnstracer, dnswalk, enum4linux, fierce, … (real recon tools).

### `tools/kali-catalog/Dockerfile.kali-catalog`
The install layer removes apt indices; the rewritten capture needs them at runtime
(`--network none`) for the `apt-cache` queries. Add a separate `RUN apt-get update`
layer AFTER the (cached) `kali-linux-large` install so indices are restored without
re-installing the expensive layer.

### Run
`KALI_META=kali-linux-large tools/kali-catalog/run.sh` → build → capture
(`--network none`) → `generate.ts` normalizes to `data/kali-tools.json`.

## Result & reconciliation

- `data/kali-tools.json` grows from 88 → the full categorized kali-linux-large tool
  set, with real categories.
- Reconcile the gated `dataset ⇄ image` guard: every dataset binary must exist in
  `autoscanner/kali-toolbox:1.0`. Since both are `kali-linux-large` the overlap is
  near-total; any stragglers (index-only / path differences) are pruned from the
  dataset or the guard is updated, and documented.

## Testing / validation

- Dataset has ≫ 88 tools and multiple categories (assert in a normalize/coverage
  check).
- `kaliTools` GraphQL returns the new categories (no API change needed — it passes
  `categories` through).
- Gated dataset⇄image guard green (or documented prunes).

## Out of scope

- #3b: surfacing the categorized Kali tools inside the Recon/OSINT cockpits
  (category → OSINT vs RECON mapping, launcher UX) — separate spec/plan.
- No change to the runtime toolbox image, scanners, parsers, or the #1/#2 work.
