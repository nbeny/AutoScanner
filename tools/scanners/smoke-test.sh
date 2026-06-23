#!/usr/bin/env bash
# =============================================================================
# Active-injection smoke test — runs the new scanners against a deliberately
# vulnerable target and checks each produces output. Requires a running Docker
# daemon. This is NOT part of CI (it needs Docker + pulls multi-hundred-MB
# images); run it manually to validate the SP1/SP3 scanners end-to-end.
#
# Usage:
#   tools/scanners/smoke-test.sh            # full run (build, target up, scan, teardown)
#   KEEP_TARGET=1 tools/scanners/smoke-test.sh   # leave the target running
#
# What it does:
#   1. Builds the custom scanner images (autoscanner/ssti-scan, ...).
#   2. Starts OWASP Juice Shop on an isolated docker network.
#   3. Runs ssti-scan, web-dast (nuclei -dast), and zap-scan (baseline) against
#      it using the SAME commands the scanner build() functions emit.
#   4. Prints a PASS/FAIL line per scanner (PASS = produced parseable output).
# =============================================================================
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NET="autoscanner-smoke"
TARGET_NAME="autoscanner-smoke-target"
TARGET_URL="http://${TARGET_NAME}:3000"
NUCLEI_IMAGE="projectdiscovery/nuclei:v3.9.0"
ZAP_IMAGE="ghcr.io/zaproxy/zaproxy:2.15.0"

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
pass() { printf '\033[1;32mPASS\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31mFAIL\033[0m %s\n' "$*"; FAILED=1; }
FAILED=0

cleanup() {
  if [ "${KEEP_TARGET:-0}" != "1" ]; then
    log "Tearing down target + network"
    docker rm -f "$TARGET_NAME" >/dev/null 2>&1 || true
    docker network rm "$NET" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

command -v docker >/dev/null 2>&1 || { echo "docker not found — start Docker first"; exit 1; }
docker info >/dev/null 2>&1 || { echo "docker daemon not reachable — start Docker first"; exit 1; }

log "Building custom scanner images"
bash "$ROOT/tools/scanners/build-images.sh"

log "Starting target (OWASP Juice Shop) on network $NET"
docker network create "$NET" >/dev/null 2>&1 || true
docker rm -f "$TARGET_NAME" >/dev/null 2>&1 || true
docker run -d --name "$TARGET_NAME" --network "$NET" bkimminich/juice-shop >/dev/null
log "Waiting for the target to accept connections"
for _ in $(seq 1 30); do
  if docker run --rm --network "$NET" curlimages/curl -fsS "$TARGET_URL" >/dev/null 2>&1; then break; fi
  sleep 2
done

# Helper: run a scanner image with a command and treat non-empty stdout as output.
run_scanner() {
  local label="$1"; shift
  local image="$1"; shift
  local out
  out="$(docker run --rm --network "$NET" "$image" "$@" 2>/dev/null)"
  if [ -n "$out" ]; then pass "$label produced output"; else fail "$label produced NO output"; fi
}

log "ssti-scan (SSTImap) — in-band SSTI"
run_scanner "ssti-scan" "autoscanner/ssti-scan:1.0" \
  sh -lc "python3 /opt/SSTImap/sstimap.py -u '${TARGET_URL}/rest/products/search?q=x' 2>/dev/null || true"

log "web-dast (nuclei -dast) — in-band fuzzing, no OAST"
run_scanner "web-dast" "$NUCLEI_IMAGE" \
  sh -lc "echo '${TARGET_URL}/rest/products/search?q=FUZZ' | nuclei -dast -silent -jsonl -no-interactsh -severity high,critical || true"

log "zap-scan (baseline) — passive spider"
run_scanner "zap-scan" "$ZAP_IMAGE" \
  sh -lc "zap-baseline.py -t '${TARGET_URL}' -J zap.json -I || true; cat zap.json 2>/dev/null || cat /zap/wrk/zap.json 2>/dev/null || true"

log "Smoke test complete"
exit "$FAILED"
