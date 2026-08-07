#!/usr/bin/env bash
# tools/kali-catalog/run.sh — build the capture image, run it (no network),
# then normalize the raw JSONL into data/kali-tools.json.
set -euo pipefail

KALI_META="${KALI_META:-kali-linux-large}"
RELEASE="${KALI_RELEASE:-$(date +%Y.%m)}"
OUT_RAW="$(mktemp)"

echo "Building capture image (KALI_META=${KALI_META}) — this is large and slow..."
docker build --build-arg "KALI_META=${KALI_META}" \
  -f tools/kali-catalog/Dockerfile.kali-catalog -t autoscanner/kali-catalog:latest \
  tools/kali-catalog

echo "Capturing tool introspection (isolated, no network)..."
docker run --rm --network none autoscanner/kali-catalog:latest > "${OUT_RAW}"

echo "Normalizing -> data/kali-tools.json ..."
pnpm tsx tools/kali-catalog/generate.ts "${OUT_RAW}" "${RELEASE}"
rm -f "${OUT_RAW}"
