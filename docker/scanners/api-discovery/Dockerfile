# api-discovery: API route brute-force using kiterunner (assetnote/kiterunner).
#
# Binary note: `go install .../cmd/kite@latest` produces the binary `kite`.
# The scanner calls `kr` (short alias), so we add a symlink kr -> kite.
#
# Wordlist note: routes-small.kite is distributed as a tar.gz in the
# kiterunner GitHub releases. We attempt to fetch it at build time.
# If the URL changes in a future release, replace the WORDLIST_URL ARG below.
FROM golang:1.22-bookworm AS build
RUN go install github.com/assetnote/kiterunner/cmd/kite@latest

FROM debian:bookworm-slim
ARG WORDLIST_URL=https://github.com/assetnote/kiterunner/releases/download/v1.0.2/routes-small.kite.tar.gz
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates \
      wget \
 && rm -rf /var/lib/apt/lists/* \
 && adduser --disabled-password --gecos '' --uid 10001 scanner \
 && mkdir -p /wordlists \
 && (wget -qO- "${WORDLIST_URL}" | tar -xz -C /wordlists/ 2>/dev/null \
     || echo "# PLACEHOLDER: real routes-small.kite wordlist must be baked in.\n# Download from https://github.com/assetnote/kiterunner/releases and rebuild." > /wordlists/routes-small.kite) \
 && chmod -R a+r /wordlists

COPY --from=build /go/bin/kite /usr/local/bin/kite
# kr is the conventional short alias used by the scanner build() command.
RUN ln -s /usr/local/bin/kite /usr/local/bin/kr
USER scanner
ENTRYPOINT []
