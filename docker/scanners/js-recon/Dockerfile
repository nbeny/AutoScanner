# js-recon: discover JS endpoints + exposed secrets in a target's JavaScript files.
#
# JSON contract expected by the js-recon-json parser (stdout, always valid JSON):
#   {
#     "endpoints": ["<url-or-path>", ...],
#     "secrets":   [{ "type": "<key-type>", "match": "<first-20-chars>", "jsUrl": "<js-file-url>" }, ...]
#   }
# The wrapper ALWAYS emits valid JSON even on failure ({"endpoints":[],"secrets":[]}).
# Endpoints are deduped. Secret matches are truncated to 20 chars (never full value).
#
# Secret regex set (intentionally small to reduce false positives):
#   aws_access_key : AKIA[0-9A-Z]{16}
#   google_api_key : AIza[0-9A-Za-z\-_]{35}
#   slack_token    : xox[baprs]-[0-9a-zA-Z\-]{10,48}
#   generic_api_key: api[_-]?key\s*[=:]\s*["']?[A-Za-z0-9_\-]{16,64}

# Stage 1: build the subjs binary (lists JS URLs linked from a page).
FROM golang:1.22-alpine AS build-go
RUN apk add --no-cache git \
 && go install github.com/lc/subjs@latest

# Stage 2: Python runtime + subjs binary + LinkFinder + wrapper script.
FROM python:3.12-slim
# curl: fetch JS files. git: clone LinkFinder (no PyPI release). ca-certificates: HTTPS.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl git \
 && rm -rf /var/lib/apt/lists/* \
 && git clone --depth 1 https://github.com/GerbenJavado/LinkFinder /opt/LinkFinder \
 && pip install --no-cache-dir -r /opt/LinkFinder/requirements.txt

COPY --from=build-go /go/bin/subjs /usr/local/bin/subjs

COPY --chmod=0755 js-recon.sh /usr/local/bin/js-recon

RUN useradd -u 10001 -m scanner
USER scanner
ENTRYPOINT []
