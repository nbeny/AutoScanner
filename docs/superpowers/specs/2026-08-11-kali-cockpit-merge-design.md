# Kali Tools in the Recon/OSINT Cockpits — Design (sub-project #3b)

Date: 2026-08-11
Status: approved (design), pending plan

## Context

#3a expanded the Kali dataset to 852 tools across 25 real categories. #3b surfaces
a **curated** subset inside the Recon and OSINT cockpit command bars so the operator
can launch Kali tools in-phase (via `runKaliTool`) instead of only on the separate
`/runner` page. Reuses the #1 composer (`ManOptionPalette`) for arg building.

Decision (brainstorming): curate both Recon and OSINT. Kali runs stay raw-output
(no normalized findings) — same as the existing Kali Runner.

## Problem: the raw dataset is noisy

Category-filtering alone is not cockpit-ready: `kali-tools-<cat>` metapackages pull
infra as deps, so e.g. `web` includes `apache2` → `apache2ctl, a2enmod, a2query…`,
and `information-gathering` includes many sub-binaries. Curation is the core work.

## Architecture

### 1. Curation module (frontend, pure) — `features/cockpit/kali-cockpit-catalog.ts`

Inputs are the `kaliTools` query rows (`{ binary, package, displayName, description,
categories, hasHelp, optionCount }`).

- `KALI_CATEGORY_GROUP: Record<string, 'RECON' | 'OSINT' | null>` — 25 categories →
  cockpit or excluded:
  - RECON: information-gathering, web, vulnerability, database, sniffing-spoofing,
    identify, detect, fuzzing.
  - OSINT: none by category (handled by allowlist below).
  - null (excluded): forensics, reverse-engineering, passwords, wireless, 802-11,
    exploitation, post-exploitation, bluetooth, voip, sdr, rfid, hardware, gpu,
    crypto-stego, social-engineering, reporting, windows-resources, protect, recover,
    respond, top10.
- `KALI_EXCLUDE_PACKAGES: ReadonlySet<string>` — infra pulled as deps: apache2,
  nginx, … (seed from observed noise; extend as found).
- `KALI_OSINT_ALLOWLIST: ReadonlySet<string>` — curated passive/identity binaries:
  theharvester, whois, dnsenum, dmitry, fierce, recon-ng, spiderfoot, sublist3r,
  … (GUI-only tools excluded).
- `curateKaliTools(rows, group)`:
  1. keep rows whose primary category maps to `group` (RECON), OR whose binary is in
     `KALI_OSINT_ALLOWLIST` (OSINT);
  2. drop rows whose `package ∈ KALI_EXCLUDE_PACKAGES`;
  3. collapse to one **primary binary per package** (prefer `binary === package`,
     else shortest binary name);
  4. sort by displayName.

Pure and unit-tested; no network.

### 2. Recon cockpit — `features/cockpit/cockpit-command-bar.tsx`

Extend `LaunchMode` to `'scanner' | 'template' | 'kali'`. In `'kali'` mode:
- fetch `KALI_TOOLS_QUERY`, run `curateKaliTools(rows, 'RECON')`;
- a searchable picker (binary + description);
- the selected tool's args composed with `ManOptionPalette` (binary = selected) +
  a raw args input + `binary args` preview (reuse the Runner's composer pattern);
- launch via `RUN_KALI_TOOL_MUTATION` (`{ engagementId, binary, args, jsonOutput }`),
  gated on `engagementId` like the other modes.

### 3. OSINT cockpit — `features/osint/`

Add a Kali launcher (own component `osint-kali-launcher.tsx` or a mode in
`osint-command-bar`): `curateKaliTools(rows, 'OSINT')` picker → same composer →
`runKaliTool`. Kept separate from the seed-based investigation flow.

### 4. Deployment

The api-gateway serves `data/kali-tools.json`; its container still holds the old
88-tool dataset. **Rebuild api-gateway** so `kaliTools` returns the 852 tools (else
the curated pickers are near-empty).

## Testing

- `curateKaliTools`: category→group filtering, infra-package exclusion, one-primary-
  binary-per-package collapse, OSINT allowlist. (pure unit)
- Recon bar: `'kali'` mode renders the curated list and fires `runKaliTool` with the
  composed args.
- OSINT launcher: renders allowlist tools and fires `runKaliTool`.

## Out of scope

- No normalized findings for Kali runs (raw output, like the Runner).
- No dataset/scanner/parser changes.
- The `/runner` page stays as the full uncurated escape hatch.
