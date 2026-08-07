# Kali tool catalog generator (SP1)

Generates `data/kali-tools.json` by introspecting a disposable Kali container.
Offline job — run it locally when you want to (re)build the dataset; the JSON is
committed and consumed by the API at runtime.

## Run

    pnpm kali:catalog                     # default: kali-linux-large
    KALI_META=kali-linux-everything pnpm kali:catalog   # max coverage (huge)

## What it does

1. Builds `Dockerfile.kali-catalog` (installs the chosen tool metapackage).
2. Runs `capture.sh` in the container **with no network**, emitting one
   RawCapture JSON per binary (description, homepage, category, help text, man).
3. `generate.ts` normalizes that into `data/kali-tools.json` and prints a
   coverage summary (tools with help vs help-less).

## Guardrails

Per-binary `--help` runs under a `timeout` (`HELP_TIMEOUT`, default 5s), output
capped (`HELP_MAX_BYTES`, default 64KB), stdin closed, and a known-bad binary
exclude list. The image is disposable; regenerate per Kali release.

## Caveats

Option parsing is best-effort (`parseConfidence`); `helpTextRaw` is the source of
truth and always kept when captured. Binaries with no clean help are recorded
with `helpTextRaw: null`.
