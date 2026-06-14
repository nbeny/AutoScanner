# gowitness v2: headless-chromium web screenshot tool (sensepost/gowitness).
# Pinned to v2.5.1 — the last stable v2 release whose CLI is:
#   gowitness single <url> --screenshot-path <dir> --disable-db
# (v3 switched to: gowitness scan single -u <url> --screenshot-path <dir>)
#
# No-sandbox note: Chromium requires --no-sandbox when running as a non-root
# user inside a container without a user namespace.  gowitness v2 auto-passes
# safe Chrome flags (including --no-sandbox) when it detects a headless
# environment, so no extra env var or flag is needed here.
FROM golang:1.22-bookworm AS build
RUN go install github.com/sensepost/gowitness@v2.5.1

# Debian bookworm-slim: chromium is available in the official repo and
# includes the right headless dependencies (libGL, fonts, etc.).
FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      chromium \
      ca-certificates \
      fonts-liberation \
 && rm -rf /var/lib/apt/lists/* \
 && adduser --disabled-password --gecos '' --uid 10001 scanner

# Tell gowitness where to find the chromium binary.
ENV GOWITNESS_CHROME_PATH=/usr/bin/chromium

COPY --from=build /go/bin/gowitness /usr/local/bin/gowitness
USER scanner
ENTRYPOINT []
