#!/bin/sh
# js-recon <host>
#
# Enumerates the target's JavaScript files, extracts endpoints (via LinkFinder)
# and checks for exposed secrets (regex patterns below).
#
# JSON contract (stdout, always valid — parser: js-recon-json):
#   { "endpoints": [...], "secrets": [{"type":..., "match":..., "jsUrl":...}] }
#
# Secret patterns (small set, documented):
#   aws_access_key  AKIA[0-9A-Z]{16}
#   google_api_key  AIza[0-9A-Za-z\-_]{35}
#   slack_token     xox[baprs]-[0-9a-zA-Z\-]{10,48}
#   generic_api_key api[_-]?key\s*[=:]\s*["']?[A-Za-z0-9_\-]{16,64}
# Matches are truncated to 20 chars to avoid leaking full secret values.

HOST="${1:-}"
if [ -z "$HOST" ]; then
  printf '{"endpoints":[],"secrets":[]}\n'
  exit 0
fi

TMPDIR_WORK=$(mktemp -d)
trap 'rm -rf "$TMPDIR_WORK"' EXIT INT TERM

ENDPOINTS_FILE="$TMPDIR_WORK/endpoints.txt"
SECRETS_JSON="$TMPDIR_WORK/secrets.json"
touch "$ENDPOINTS_FILE"
printf '[' > "$SECRETS_JSON"
FIRST_SECRET=1

# Helper: append one secret JSON object (no full secret value, truncated to 20 chars).
append_secret() {
  TYPE="$1"
  MATCH="$2"
  JSURL="$3"
  SAFE=$(printf '%s' "$MATCH" | cut -c1-20)
  # Minimal JSON escaping for the URL (backslash + double-quote only).
  URL_ESC=$(printf '%s' "$JSURL" | sed 's/\\/\\\\/g; s/"/\\"/g')
  if [ "$FIRST_SECRET" = "1" ]; then
    FIRST_SECRET=0
  else
    printf ',' >> "$SECRETS_JSON"
  fi
  printf '{"type":"%s","match":"%s","jsUrl":"%s"}' "$TYPE" "$SAFE" "$URL_ESC" >> "$SECRETS_JSON"
}

# 1. Enumerate JS URLs via subjs (cap to 50 to limit runtime/bandwidth).
JS_URLS=$(printf 'https://%s\n' "$HOST" | subjs 2>/dev/null | head -50 || true)

for JS_URL in $JS_URLS; do
  JS_FILE="$TMPDIR_WORK/js_$(printf '%s' "$JS_URL" | md5sum | cut -c1-8).js"

  # 2. Fetch JS file (15 s timeout, 5 MB max, follow redirects).
  curl -s --max-time 15 --max-filesize 5000000 -L "$JS_URL" -o "$JS_FILE" 2>/dev/null || continue
  [ -s "$JS_FILE" ] || continue

  # 3. Extract endpoints via LinkFinder (-o cli = text mode, one endpoint per line).
  python /opt/LinkFinder/linkfinder.py -i "$JS_FILE" -o cli 2>/dev/null \
    | grep -v '^$' >> "$ENDPOINTS_FILE" || true

  # 4. Secret scanning (grep -oP = Perl regex, print only the match).
  # AWS access key
  grep -oP 'AKIA[0-9A-Z]{16}' "$JS_FILE" 2>/dev/null | while IFS= read -r M; do
    append_secret 'aws_access_key' "$M" "$JS_URL"
  done || true

  # Google API key
  grep -oP 'AIza[0-9A-Za-z\-_]{35}' "$JS_FILE" 2>/dev/null | while IFS= read -r M; do
    append_secret 'google_api_key' "$M" "$JS_URL"
  done || true

  # Slack token
  grep -oP 'xox[baprs]-[0-9a-zA-Z\-]{10,48}' "$JS_FILE" 2>/dev/null | while IFS= read -r M; do
    append_secret 'slack_token' "$M" "$JS_URL"
  done || true

  # Generic api_key assignment (case-insensitive)
  grep -oiP 'api[_-]?key\s*[=:]\s*["\x27]?[A-Za-z0-9_\-]{16,64}' "$JS_FILE" 2>/dev/null | while IFS= read -r M; do
    append_secret 'generic_api_key' "$M" "$JS_URL"
  done || true
done

printf ']' >> "$SECRETS_JSON"

# 5. Build deduplicated endpoints JSON array.
ENDPOINTS_JSON=$(
  sort -u "$ENDPOINTS_FILE" 2>/dev/null \
  | awk 'BEGIN{printf "["} NR>1{printf ","} {gsub(/"/,"\\\"",$0); printf "\"%s\"",$0} END{printf "]"}' \
  || printf '[]'
)
# Safety: if awk produced nothing (empty file), use empty array.
[ -z "$ENDPOINTS_JSON" ] && ENDPOINTS_JSON='[]'

SECRETS_CONTENT=$(cat "$SECRETS_JSON" 2>/dev/null || printf '[]')

printf '{"endpoints":%s,"secrets":%s}\n' "$ENDPOINTS_JSON" "$SECRETS_CONTENT"
