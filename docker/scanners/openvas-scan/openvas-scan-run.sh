#!/bin/sh
# openvas-scan-run.sh — drives the openvasd HTTP API lifecycle for a single target.
#
# VERSION-DEPENDENT ASSUMPTIONS (verify against your openvasd release):
#   Health endpoint : GET /health/alive  → {"status":"alive"} or similar
#   VT probe        : GET /vts?page=1&pageSize=1  → array; empty = feed not loaded
#   Create scan     : POST /scans  body: {target:{hosts:[],ports:[]},vts:{group:[]}}
#   Start scan      : POST /scans/<id>  body: {"action":"start"}
#   Poll status     : GET /scans/<id>/status  → field "status.phase" or similar
#                     Terminal values: "succeeded", "failed", "stopped"
#   Fetch results   : GET /scans/<id>/results  → JSON array
#   Delete scan     : DELETE /scans/<id>
#   Auth header     : X-API-KEY
#
# Only the final results JSON array is written to stdout.
# All diagnostics/errors are written to stderr.
# The script fails loudly on missing credentials or an unloaded feed (never
# emitting a false empty "0 vulns" result).
#
# Usage: openvas-scan-run <target-host>
#   OPENVASD_URL     — defaults to http://openvasd:3000
#   OPENVASD_API_KEY — required; injected by the scan-worker

set -eu

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
OPENVASD_URL="${OPENVASD_URL:-http://openvasd:3000}"
POLL_INTERVAL=10      # seconds between status polls
MAX_ITERATIONS=170    # 170 × 10 s = ~28 min; stays under the 30-min container timeout

# ---------------------------------------------------------------------------
# Validate inputs
# ---------------------------------------------------------------------------
if [ -z "${OPENVASD_API_KEY:-}" ]; then
  printf '{"error":"OPENVASD_API_KEY is not set","code":"missing_credential"}\n' >&2
  exit 1
fi

if [ $# -lt 1 ] || [ -z "$1" ]; then
  printf '{"error":"target argument is required","usage":"openvas-scan-run <host>"}\n' >&2
  exit 1
fi
TARGET="$1"

# ---------------------------------------------------------------------------
# Helper: curl with common flags.
# All intermediate curl calls write to stderr (via -v redirect or explicit
# redirection) to prevent partial/garbage bytes reaching stdout.
# ---------------------------------------------------------------------------
api_curl() {
  # Usage: api_curl <method> <path> [extra curl args...]
  _method="$1"; shift
  _path="$1";   shift
  curl --silent --fail --show-error \
    -X "$_method" \
    -H "X-API-KEY: ${OPENVASD_API_KEY}" \
    -H "Content-Type: application/json" \
    "${@}" \
    "${OPENVASD_URL}${_path}"
}

# ---------------------------------------------------------------------------
# Step 1: Feed guard — health check + VT count probe
# ---------------------------------------------------------------------------
printf '[openvas-scan] checking openvasd health at %s/health/alive\n' "$OPENVASD_URL" >&2

health_body="$(api_curl GET /health/alive 2>&1)" || {
  printf '{"error":"openvasd unreachable","url":"%s","detail":"%s"}\n' \
    "$OPENVASD_URL" "$(printf '%s' "$health_body" | tr '"' "'")" >&2
  exit 1
}
printf '[openvas-scan] health response: %s\n' "$health_body" >&2

printf '[openvas-scan] probing VT feed at %s/vts?page=1&pageSize=1\n' "$OPENVASD_URL" >&2
# Use --get and --data-urlencode to avoid shell glob expansion of '&'
vt_body="$(curl --silent --fail --show-error \
  -H "X-API-KEY: ${OPENVASD_API_KEY}" \
  --get \
  --data-urlencode "page=1" \
  --data-urlencode "pageSize=1" \
  "${OPENVASD_URL}/vts" 2>&1)" || {
  printf '{"error":"VT feed probe failed","detail":"%s"}\n' \
    "$(printf '%s' "$vt_body" | tr '"' "'")" >&2
  exit 1
}

# Feed guard: if the VT response is an empty array or has a count of 0,
# the feed has not finished syncing — refuse to scan.
# VERSION-DEPENDENT: the exact JSON shape of /vts may differ.
vt_count="$(printf '%s' "$vt_body" | jq 'if type == "array" then length
  elif type == "object" then (.total // .count // (.vts | length) // 0)
  else 0 end' 2>/dev/null || printf '0')"

if [ "$vt_count" -eq 0 ]; then
  printf '{"error":"openvasd feed not loaded (VT count = 0) — wait for feed sync to complete"}\n' >&2
  exit 1
fi
printf '[openvas-scan] feed OK (%s VT(s) visible in probe)\n' "$vt_count" >&2

# ---------------------------------------------------------------------------
# Step 2: Create the scan
# VERSION-DEPENDENT: the scan-create body schema (target/vts structure) must
# be verified against the openvasd release in use.  The body below uses the
# schema documented for openvasd 22.x / Greenbone Community Containers.
# The "group" vt-selector requests all "Full and fast" NVTs.
# ---------------------------------------------------------------------------
printf '[openvas-scan] creating scan for target: %s\n' "$TARGET" >&2

# jq --arg ensures the target string is JSON-encoded and NEVER shell-interpolated
# into the body, eliminating the injection surface entirely.
scan_body="$(jq -n --arg host "$TARGET" '{
  target: {
    hosts: [$host],
    ports: [
      { protocol: "tcp", range: [{ start: 1, end: 65535 }] },
      { protocol: "udp", range: [{ start: 1, end: 65535 }] }
    ]
  },
  vts: {
    group: [
      {
        family: "Service detection"
      },
      {
        family: "General"
      },
      {
        family: "Product detection"
      },
      {
        family: "Gain a shell remotely"
      },
      {
        family: "Remote file access"
      },
      {
        family: "Denial of Service"
      },
      {
        family: "Brute force attacks"
      },
      {
        family: "Buffer overflow"
      },
      {
        family: "Web application abuses"
      },
      {
        family: "Default Accounts"
      },
      {
        family: "Credentials"
      }
    ]
  },
  scanner_preferences: []
}')"

create_response="$(printf '%s' "$scan_body" | api_curl POST /scans -d @- 2>&1)" || {
  printf '{"error":"scan create failed","detail":"%s"}\n' \
    "$(printf '%s' "$create_response" | tr '"' "'")" >&2
  exit 1
}
printf '[openvas-scan] create response: %s\n' "$create_response" >&2

# VERSION-DEPENDENT: the field name for the scan id may be "id", "scan_id", etc.
scan_id="$(printf '%s' "$create_response" | jq -r '.id // .scan_id // empty')"
if [ -z "$scan_id" ]; then
  printf '{"error":"could not parse scan id from create response","response":"%s"}\n' \
    "$(printf '%s' "$create_response" | tr '"' "'")" >&2
  exit 1
fi
printf '[openvas-scan] scan id: %s\n' "$scan_id" >&2

# ---------------------------------------------------------------------------
# Cleanup trap — best-effort DELETE on exit (ignore errors)
# ---------------------------------------------------------------------------
cleanup() {
  printf '[openvas-scan] cleaning up scan %s\n' "$scan_id" >&2
  api_curl DELETE "/scans/${scan_id}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Step 3: Start the scan
# VERSION-DEPENDENT: the action verb ("start") and body schema may differ.
# ---------------------------------------------------------------------------
printf '[openvas-scan] starting scan %s\n' "$scan_id" >&2
start_response="$(api_curl POST "/scans/${scan_id}" \
  -d '{"action":"start"}' 2>&1)" || {
  printf '{"error":"scan start failed","scan_id":"%s","detail":"%s"}\n' \
    "$scan_id" "$(printf '%s' "$start_response" | tr '"' "'")" >&2
  exit 1
}
printf '[openvas-scan] start response: %s\n' "$start_response" >&2

# ---------------------------------------------------------------------------
# Step 4: Poll for completion
# VERSION-DEPENDENT: the status response field path (e.g. .status, .phase,
# .status.phase) and terminal values must be verified against your openvasd
# release.  Values assumed here: "succeeded", "failed", "stopped".
# ---------------------------------------------------------------------------
printf '[openvas-scan] polling status (max %d iterations, %ds interval)\n' \
  "$MAX_ITERATIONS" "$POLL_INTERVAL" >&2

iteration=0
phase=""
while [ "$iteration" -lt "$MAX_ITERATIONS" ]; do
  iteration=$((iteration + 1))
  sleep "$POLL_INTERVAL"

  status_response="$(api_curl GET "/scans/${scan_id}/status" 2>&1)" || {
    printf '[openvas-scan] warning: status poll %d failed, retrying\n' "$iteration" >&2
    continue
  }

  # VERSION-DEPENDENT: try common field paths for the phase/status string.
  phase="$(printf '%s' "$status_response" | \
    jq -r '.phase // .status.phase // .status // empty' 2>/dev/null || true)"

  printf '[openvas-scan] iteration %d/%d — phase: %s\n' \
    "$iteration" "$MAX_ITERATIONS" "${phase:-unknown}" >&2

  case "$phase" in
    succeeded)
      printf '[openvas-scan] scan completed successfully\n' >&2
      break
      ;;
    failed|stopped)
      printf '{"error":"scan terminated with phase: %s","scan_id":"%s"}\n' \
        "$phase" "$scan_id" >&2
      exit 1
      ;;
  esac
done

if [ "$phase" != "succeeded" ]; then
  printf '{"error":"scan timed out after %d polls","scan_id":"%s","last_phase":"%s"}\n' \
    "$MAX_ITERATIONS" "$scan_id" "${phase:-unknown}" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 5: Fetch results — ONLY this goes to stdout
# VERSION-DEPENDENT: /results may be paginated or wrapped in an object.
# ---------------------------------------------------------------------------
printf '[openvas-scan] fetching results for scan %s\n' "$scan_id" >&2
results="$(api_curl GET "/scans/${scan_id}/results" 2>&1)" || {
  printf '{"error":"results fetch failed","scan_id":"%s","detail":"%s"}\n' \
    "$scan_id" "$(printf '%s' "$results" | tr '"' "'")" >&2
  exit 1
}

# Emit the raw results JSON to stdout — this is the only stdout output.
printf '%s\n' "$results"
