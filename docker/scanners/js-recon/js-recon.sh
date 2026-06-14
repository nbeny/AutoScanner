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

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT INT TERM

ENDPOINTS_FILE="$WORK/endpoints.txt"
SECRETS_JSON="$WORK/secrets.json"
MATCH_TMP="$WORK/m.txt"
JS_URLS_FILE="$WORK/jsurls.txt"
touch "$ENDPOINTS_FILE"
printf '[' > "$SECRETS_JSON"
FIRST_SECRET=1

# Helper: append one secret JSON object (no full secret value, truncated to 20 chars).
# Must be called in the parent shell (never inside a pipe subshell) so that
# FIRST_SECRET propagates correctly across invocations.
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
#    Write to a file so the loop below runs in the parent shell (no subshell pipe).
printf 'https://%s\n' "$HOST" | subjs 2>/dev/null | head -50 > "$JS_URLS_FILE" 2>/dev/null || true

# M4 fix: loop over the file with while-read instead of unquoted `for` expansion,
# so JS URLs containing spaces or glob characters are handled safely.
while IFS= read -r JS_URL; do
  JS_FILE="$WORK/js_$(printf '%s' "$JS_URL" | md5sum | cut -c1-8).js"

  # 2. Fetch JS file (15 s timeout, 5 MB max, follow redirects).
  curl -s --max-time 15 --max-filesize 5000000 -L "$JS_URL" -o "$JS_FILE" 2>/dev/null || continue
  [ -s "$JS_FILE" ] || continue

  # 3. Extract endpoints via LinkFinder (-o cli = text mode, one endpoint per line).
  python /opt/LinkFinder/linkfinder.py -i "$JS_FILE" -o cli 2>/dev/null \
    | grep -v '^$' >> "$ENDPOINTS_FILE" || true

  # 4. Secret scanning (grep -oP = Perl regex, print only the match).
  # C1 fix: redirect grep output to a temp file and loop with `while … done < file`
  # so append_secret runs in the PARENT shell and FIRST_SECRET propagates correctly.
  # (A `grep … | while …` pipe spawns a subshell where variable changes are lost.)

  # AWS access key
  grep -oP 'AKIA[0-9A-Z]{16}' "$JS_FILE" 2>/dev/null > "$MATCH_TMP" || true
  while IFS= read -r M; do append_secret 'aws_access_key' "$M" "$JS_URL"; done < "$MATCH_TMP"

  # Google API key
  grep -oP 'AIza[0-9A-Za-z\-_]{35}' "$JS_FILE" 2>/dev/null > "$MATCH_TMP" || true
  while IFS= read -r M; do append_secret 'google_api_key' "$M" "$JS_URL"; done < "$MATCH_TMP"

  # Slack token
  grep -oP 'xox[baprs]-[0-9a-zA-Z\-]{10,48}' "$JS_FILE" 2>/dev/null > "$MATCH_TMP" || true
  while IFS= read -r M; do append_secret 'slack_token' "$M" "$JS_URL"; done < "$MATCH_TMP"

  # Generic api_key assignment (case-insensitive)
  grep -oiP 'api[_-]?key\s*[=:]\s*["\x27]?[A-Za-z0-9_\-]{16,64}' "$JS_FILE" 2>/dev/null > "$MATCH_TMP" || true
  while IFS= read -r M; do append_secret 'generic_api_key' "$M" "$JS_URL"; done < "$MATCH_TMP"

done < "$JS_URLS_FILE"

printf ']' >> "$SECRETS_JSON"

# 5. Build deduplicated endpoints JSON array.
# I2 fix: escape backslashes BEFORE escaping double-quotes to produce valid JSON.
ENDPOINTS_JSON=$(
  sort -u "$ENDPOINTS_FILE" 2>/dev/null \
  | awk 'BEGIN{printf "["} NR>1{printf ","} {gsub(/\\/,"\\\\",$0); gsub(/"/,"\\\"",$0); printf "\"%s\"",$0} END{printf "]"}' \
  || printf '[]'
)
# Safety: if awk produced nothing (empty file), use empty array.
[ -z "$ENDPOINTS_JSON" ] && ENDPOINTS_JSON='[]'

SECRETS_CONTENT=$(cat "$SECRETS_JSON" 2>/dev/null || printf '[]')

printf '{"endpoints":%s,"secrets":%s}\n' "$ENDPOINTS_JSON" "$SECRETS_CONTENT"
